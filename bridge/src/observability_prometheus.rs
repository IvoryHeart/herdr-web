use std::collections::{BTreeMap, HashMap};
use std::env;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use reqwest::Url;
use serde::Deserialize;
use tracing::warn;

use crate::observability::{
    now_millis, ObservabilityCapability, ObservabilityContractVersion, ObservabilityDescriptor,
    ObservabilityEnvelope, ObservabilityFreshness, ObservabilityFreshnessMode, ObservabilityHealth,
    ObservabilityOperation, ObservabilityPayload, ObservabilityProvider, ObservabilitySignal,
    ObservabilityTruncation, ObservabilityTruncationReason, OBSERVABILITY_EXTENSION_ID,
};

const PROVIDER_ID: &str = "prometheus.otel";
const PAYLOAD_NAMESPACE: &str = "herdr-world.otel.metrics";
const DEFAULT_WINDOW_SECONDS: u64 = 24 * 60 * 60;
const DEFAULT_REFRESH_SECONDS: u64 = 30;
const DEFAULT_MAX_MODELS: usize = 128;
const MIN_WINDOW_SECONDS: u64 = 60;
const MAX_WINDOW_SECONDS: u64 = 30 * 24 * 60 * 60;
const MIN_REFRESH_SECONDS: u64 = 5;
const MAX_REFRESH_SECONDS: u64 = 15 * 60;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_OPENAI_RATE_CARD_VERSION: &str = "openai-api-standard-2026-08-10";
const DEFAULT_OPENAI_FALLBACK_MODEL: &str = "gpt-5.6-sol";

#[derive(Debug, Clone)]
pub struct PrometheusConfig {
    pub(crate) endpoint: Url,
    pub(crate) window_seconds: u64,
    pub(crate) refresh_seconds: u64,
    pub(crate) max_models: usize,
    openai_pricing: OpenAiPricing,
}

impl PrometheusConfig {
    pub fn from_env() -> Result<Option<Self>, String> {
        let Some(raw_endpoint) = env::var_os("HERDR_WORLD_OTEL_PROMETHEUS_URL") else {
            return Ok(None);
        };
        let raw_endpoint = raw_endpoint
            .to_str()
            .ok_or_else(|| "HERDR_WORLD_OTEL_PROMETHEUS_URL is not valid UTF-8".to_string())?
            .trim();
        if raw_endpoint.is_empty() {
            return Ok(None);
        }

        let mut config = Self::from_endpoint_and_settings(
            raw_endpoint,
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_WINDOW_SECONDS")
                .ok()
                .as_deref(),
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_REFRESH_SECONDS")
                .ok()
                .as_deref(),
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_MAX_MODELS")
                .ok()
                .as_deref(),
        )?;
        config.openai_pricing = OpenAiPricing::from_env()?;
        Ok(Some(config))
    }

    pub(crate) fn from_settings_endpoint(raw_endpoint: &str) -> Result<Self, String> {
        let mut config = Self::from_endpoint_and_settings(
            raw_endpoint,
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_WINDOW_SECONDS")
                .ok()
                .as_deref(),
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_REFRESH_SECONDS")
                .ok()
                .as_deref(),
            env::var("HERDR_WORLD_OTEL_PROMETHEUS_MAX_MODELS")
                .ok()
                .as_deref(),
        )?;
        config.openai_pricing = OpenAiPricing::from_env()?;
        Ok(config)
    }

    pub(crate) fn endpoint_string(&self) -> String {
        self.endpoint.to_string()
    }

    fn from_endpoint_and_settings(
        raw_endpoint: &str,
        window_seconds: Option<&str>,
        refresh_seconds: Option<&str>,
        max_models: Option<&str>,
    ) -> Result<Self, String> {
        let mut endpoint = Url::parse(raw_endpoint)
            .map_err(|_| "HERDR_WORLD_OTEL_PROMETHEUS_URL must be a valid URL".to_string())?;
        if !matches!(endpoint.scheme(), "http" | "https") {
            return Err("HERDR_WORLD_OTEL_PROMETHEUS_URL must use http or https".to_string());
        }
        if endpoint.host_str().is_none() {
            return Err("HERDR_WORLD_OTEL_PROMETHEUS_URL must include a host".to_string());
        }
        if !endpoint.username().is_empty() || endpoint.password().is_some() {
            return Err(
                "HERDR_WORLD_OTEL_PROMETHEUS_URL must not contain embedded credentials".to_string(),
            );
        }
        endpoint.set_query(None);
        endpoint.set_fragment(None);
        if !endpoint.path().ends_with('/') {
            let path = endpoint.path().to_string();
            endpoint.set_path(&format!("{path}/"));
        }

        let window_seconds = parse_bounded_value(
            "HERDR_WORLD_OTEL_PROMETHEUS_WINDOW_SECONDS",
            window_seconds,
            DEFAULT_WINDOW_SECONDS,
            MIN_WINDOW_SECONDS,
            MAX_WINDOW_SECONDS,
        )?;
        let refresh_seconds = parse_bounded_value(
            "HERDR_WORLD_OTEL_PROMETHEUS_REFRESH_SECONDS",
            refresh_seconds,
            DEFAULT_REFRESH_SECONDS,
            MIN_REFRESH_SECONDS,
            MAX_REFRESH_SECONDS,
        )?;
        let max_models = parse_bounded_value(
            "HERDR_WORLD_OTEL_PROMETHEUS_MAX_MODELS",
            max_models,
            DEFAULT_MAX_MODELS as u64,
            1,
            512,
        )? as usize;

        Ok(Self {
            endpoint,
            window_seconds,
            refresh_seconds,
            max_models,
            openai_pricing: OpenAiPricing::default(),
        })
    }

    fn query_url(&self) -> Result<Url, String> {
        self.endpoint
            .join("api/v1/query")
            .map_err(|_| "could not construct the Prometheus query URL".to_string())
    }
}

#[derive(Debug, Clone)]
struct OpenAiPricing {
    version: String,
    fallback_model: String,
    models: HashMap<String, OpenAiModelRates>,
    configured: bool,
}

impl Default for OpenAiPricing {
    fn default() -> Self {
        Self {
            version: DEFAULT_OPENAI_RATE_CARD_VERSION.to_string(),
            fallback_model: DEFAULT_OPENAI_FALLBACK_MODEL.to_string(),
            models: default_openai_model_rates(),
            configured: false,
        }
    }
}

impl OpenAiPricing {
    fn from_env() -> Result<Self, String> {
        let Some(raw) = env::var_os("HERDR_WORLD_OTEL_OPENAI_PRICING_JSON") else {
            return Ok(Self::default());
        };
        let raw = raw
            .to_str()
            .ok_or_else(|| "HERDR_WORLD_OTEL_OPENAI_PRICING_JSON is not valid UTF-8".to_string())?;
        let file = serde_json::from_str::<OpenAiPricingFile>(raw).map_err(|error| {
            format!("HERDR_WORLD_OTEL_OPENAI_PRICING_JSON is invalid JSON: {error}")
        })?;
        let version = file
            .version
            .unwrap_or_else(|| "configured-openai-rate-card".to_string());
        let fallback_model = file
            .fallback_model
            .unwrap_or_else(|| DEFAULT_OPENAI_FALLBACK_MODEL.to_string());
        if file.models.is_empty() {
            return Err(
                "HERDR_WORLD_OTEL_OPENAI_PRICING_JSON must contain at least one model".to_string(),
            );
        }
        for (model, rates) in &file.models {
            rates.validate(model)?;
        }
        if !file.models.contains_key(&fallback_model) {
            return Err(format!(
                "HERDR_WORLD_OTEL_OPENAI_PRICING_JSON fallback_model {fallback_model:?} is not present in models"
            ));
        }
        Ok(Self {
            version,
            fallback_model,
            models: file.models,
            configured: true,
        })
    }

    fn resolve(&self, model: &str) -> (&OpenAiModelRates, String, bool) {
        if let Some(rates) = self.models.get(model) {
            return (rates, model.to_string(), false);
        }
        let fallback_model = self.fallback_model.as_str();
        (
            self.models
                .get(fallback_model)
                .expect("validated OpenAI fallback model is present"),
            fallback_model.to_string(),
            true,
        )
    }
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAiPricingFile {
    version: Option<String>,
    fallback_model: Option<String>,
    models: HashMap<String, OpenAiModelRates>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAiModelRates {
    input: f64,
    cached_input: f64,
    cache_write: Option<f64>,
    output: f64,
}

impl OpenAiModelRates {
    fn validate(&self, model: &str) -> Result<(), String> {
        let values = [
            ("input", self.input),
            ("cached_input", self.cached_input),
            ("output", self.output),
        ];
        for (name, value) in values {
            if !value.is_finite() || value < 0.0 {
                return Err(format!(
                    "OpenAI pricing for {model:?} has invalid {name} rate"
                ));
            }
        }
        if let Some(value) = self.cache_write {
            if !value.is_finite() || value < 0.0 {
                return Err(format!(
                    "OpenAI pricing for {model:?} has invalid cache_write rate"
                ));
            }
        }
        Ok(())
    }
}

fn default_openai_model_rates() -> HashMap<String, OpenAiModelRates> {
    [
        (
            "gpt-5.6-sol",
            OpenAiModelRates {
                input: 5.0,
                cached_input: 0.5,
                cache_write: Some(6.25),
                output: 30.0,
            },
        ),
        (
            "gpt-5.6-terra",
            OpenAiModelRates {
                input: 2.0,
                cached_input: 0.2,
                cache_write: Some(2.5),
                output: 12.0,
            },
        ),
        (
            "gpt-5.6-luna",
            OpenAiModelRates {
                input: 0.2,
                cached_input: 0.02,
                cache_write: Some(0.25),
                output: 1.2,
            },
        ),
        (
            "gpt-5.5",
            OpenAiModelRates {
                input: 5.0,
                cached_input: 0.5,
                cache_write: None,
                output: 30.0,
            },
        ),
        (
            "gpt-5.4",
            OpenAiModelRates {
                input: 2.5,
                cached_input: 0.25,
                cache_write: None,
                output: 15.0,
            },
        ),
        (
            "gpt-5.4-mini",
            OpenAiModelRates {
                input: 0.75,
                cached_input: 0.075,
                cache_write: None,
                output: 4.5,
            },
        ),
        (
            "gpt-5.4-nano",
            OpenAiModelRates {
                input: 0.2,
                cached_input: 0.02,
                cache_write: None,
                output: 1.25,
            },
        ),
        (
            "gpt-5.3-codex",
            OpenAiModelRates {
                input: 1.75,
                cached_input: 0.175,
                cache_write: None,
                output: 14.0,
            },
        ),
    ]
    .into_iter()
    .map(|(model, rates)| (model.to_string(), rates))
    .collect()
}

fn parse_bounded_value(
    name: &str,
    raw: Option<&str>,
    default: u64,
    minimum: u64,
    maximum: u64,
) -> Result<u64, String> {
    let Some(raw) = raw else {
        return Ok(default);
    };
    let value = raw
        .parse::<u64>()
        .map_err(|_| format!("{name} must be an integer"))?;
    if !(minimum..=maximum).contains(&value) {
        return Err(format!("{name} must be between {minimum} and {maximum}"));
    }
    Ok(value)
}

#[derive(Debug, Clone)]
struct ProviderState {
    health: ObservabilityHealth,
    observed_at: u64,
    envelopes: Vec<ObservabilityEnvelope>,
}

impl Default for ProviderState {
    fn default() -> Self {
        Self {
            health: ObservabilityHealth::Degraded,
            observed_at: now_millis(),
            envelopes: Vec::new(),
        }
    }
}

pub struct PrometheusObservabilityProvider {
    client: reqwest::Client,
    config: PrometheusConfig,
    state: Arc<RwLock<ProviderState>>,
}

impl PrometheusObservabilityProvider {
    fn create(config: PrometheusConfig) -> Arc<Self> {
        Arc::new(Self {
            client: reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .expect("Prometheus HTTP client configuration is valid"),
            config,
            state: Arc::new(RwLock::new(ProviderState::default())),
        })
    }

    fn spawn_refresh_task(provider: &Arc<Self>, refresh_immediately: bool) {
        let task_provider = Arc::downgrade(provider);
        let refresh_seconds = provider.config.refresh_seconds;
        tokio::spawn(async move {
            if refresh_immediately {
                let Some(provider) = task_provider.upgrade() else {
                    return;
                };
                provider.refresh().await;
            }
            let mut interval = tokio::time::interval(Duration::from_secs(refresh_seconds));
            interval.tick().await;
            loop {
                interval.tick().await;
                let Some(provider) = task_provider.upgrade() else {
                    return;
                };
                provider.refresh().await;
            }
        });
    }

    pub fn start(config: PrometheusConfig) -> Arc<Self> {
        let provider = Self::create(config);
        Self::spawn_refresh_task(&provider, true);
        provider
    }

    pub async fn start_ready(config: PrometheusConfig) -> Arc<Self> {
        let provider = Self::create(config);
        provider.refresh().await;
        Self::spawn_refresh_task(&provider, false);
        provider
    }

    async fn refresh(&self) {
        let result = self.fetch_envelope().await;
        let mut state = self
            .state
            .write()
            .expect("Prometheus provider state lock poisoned");
        match result {
            Ok(envelope) => {
                state.health = ObservabilityHealth::Available;
                state.observed_at = envelope.observed_at;
                state.envelopes = vec![envelope];
            }
            Err(error) => {
                state.health = ObservabilityHealth::Degraded;
                state.observed_at = now_millis();
                state.envelopes.clear();
                warn!(provider = PROVIDER_ID, error = %error, "Prometheus observability refresh failed");
            }
        }
    }

    async fn fetch_envelope(&self) -> Result<ObservabilityEnvelope, String> {
        let codex_query = format!(
            "sum by (model, token_type) (increase(codex_turn_token_usage_sum[{}s]))",
            self.config.window_seconds
        );
        let claude_usage_query = format!(
            "sum by (model, type) (increase(claude_code_token_usage_tokens_total[{}s]))",
            self.config.window_seconds
        );
        let claude_cost_query = format!(
            "sum by (model) (increase(claude_code_cost_usage_USD_total[{}s]))",
            self.config.window_seconds
        );

        let (codex, claude_usage, claude_cost) = tokio::try_join!(
            self.query(&codex_query),
            self.query(&claude_usage_query),
            self.query(&claude_cost_query),
        )?;
        let mut models = BTreeMap::<(String, String), ModelMetrics>::new();

        for sample in codex {
            let Some(model) = sample.metric.get("model").filter(|model| !model.is_empty()) else {
                continue;
            };
            let token_type = sample
                .metric
                .get("token_type")
                .map(String::as_str)
                .unwrap_or("unknown");
            let entry = models
                .entry(("openai".to_string(), model.clone()))
                .or_default();
            entry
                .usage
                .insert(normalize_usage_name(token_type), sample.value()?);
        }

        for sample in claude_usage {
            let Some(model) = sample.metric.get("model").filter(|model| !model.is_empty()) else {
                continue;
            };
            let usage_type = sample
                .metric
                .get("type")
                .map(String::as_str)
                .unwrap_or("unknown");
            let entry = models
                .entry(("anthropic".to_string(), model.clone()))
                .or_default();
            entry
                .usage
                .insert(normalize_usage_name(usage_type), sample.value()?);
        }

        for sample in claude_cost {
            let Some(model) = sample.metric.get("model").filter(|model| !model.is_empty()) else {
                continue;
            };
            let entry = models
                .entry(("anthropic".to_string(), model.clone()))
                .or_default();
            entry.cost_usd = Some(sample.value()?.max(0.0));
            entry.cost_kind = Some("reported");
        }

        for ((provider, model), metrics) in &mut models {
            if provider != "openai" {
                continue;
            }
            let estimate = estimate_openai_cost(&self.config.openai_pricing, model, &metrics.usage);
            metrics.cost_usd = Some(estimate.total_usd);
            metrics.cost_kind = Some(estimate.kind);
            metrics.cost_rate_card_model = Some(estimate.rate_card_model.to_string());
        }

        let mut model_values = Vec::with_capacity(models.len().min(self.config.max_models));
        let truncated = models.len() > self.config.max_models;
        for ((provider, model), metrics) in models.into_iter().take(self.config.max_models) {
            let mut value = serde_json::Map::new();
            value.insert("provider".to_string(), serde_json::Value::String(provider));
            value.insert("model".to_string(), serde_json::Value::String(model));
            let usage = metrics
                .usage
                .into_iter()
                .map(|(name, value)| (name, json_number(value)))
                .collect::<serde_json::Map<_, _>>();
            value.insert("usage".to_string(), serde_json::Value::Object(usage));
            if let Some(cost_usd) = metrics.cost_usd {
                value.insert("cost_usd".to_string(), json_number(cost_usd));
            }
            if let Some(cost_kind) = metrics.cost_kind {
                value.insert(
                    "cost_kind".to_string(),
                    serde_json::Value::String(cost_kind.to_string()),
                );
            }
            if let Some(rate_card_model) = metrics.cost_rate_card_model {
                value.insert(
                    "cost_rate_card_model".to_string(),
                    serde_json::Value::String(rate_card_model),
                );
            }
            model_values.push(serde_json::Value::Object(value));
        }

        let observed_at = now_millis();
        let mut payload = serde_json::Map::new();
        payload.insert(
            "source".to_string(),
            serde_json::Value::String("prometheus".to_string()),
        );
        payload.insert(
            "aggregation".to_string(),
            serde_json::Value::String("configured_source".to_string()),
        );
        payload.insert(
            "cost_estimation".to_string(),
            serde_json::json!({
                "provider": "openai",
                "kind": "estimated_standard_api_equivalent",
                "rate_card_version": self.config.openai_pricing.version,
                "configured": self.config.openai_pricing.configured,
                "fallback_model": self.config.openai_pricing.fallback_model,
            }),
        );
        payload.insert(
            "window_seconds".to_string(),
            serde_json::Value::from(self.config.window_seconds),
        );
        payload.insert("models".to_string(), serde_json::Value::Array(model_values));

        Ok(ObservabilityEnvelope {
            extension_id: OBSERVABILITY_EXTENSION_ID.to_string(),
            contract_version: ObservabilityContractVersion::CURRENT,
            provider_id: PROVIDER_ID.to_string(),
            target: None,
            observed_at,
            status: ObservabilityHealth::Available,
            payload: ObservabilityPayload {
                namespace: PAYLOAD_NAMESPACE.to_string(),
                data: serde_json::Value::Object(payload),
            },
            truncated: truncated.then_some(ObservabilityTruncation {
                reason: ObservabilityTruncationReason::ProviderPolicy,
                original_bytes: None,
                fields: vec!["models".to_string()],
            }),
            sequence: None,
            replay: None,
        })
    }

    async fn query(&self, expression: &str) -> Result<Vec<PrometheusSample>, String> {
        let url = self.config.query_url()?;
        let response = self
            .client
            .get(url)
            .query(&[("query", expression)])
            .send()
            .await
            .map_err(|error| format!("Prometheus request failed: {error}"))?;
        let status = response.status();
        let body = response
            .json::<PrometheusResponse>()
            .await
            .map_err(|error| format!("Prometheus response was invalid: {error}"))?;
        if !status.is_success() || body.status != "success" {
            return Err(body
                .error
                .unwrap_or_else(|| format!("Prometheus returned HTTP {status}")));
        }
        let data = body
            .data
            .ok_or_else(|| "Prometheus success response is missing data".to_string())?;
        if data.result_type != "vector" {
            return Err(format!(
                "Prometheus returned unsupported result type {}",
                data.result_type
            ));
        }
        Ok(data.result)
    }
}

impl ObservabilityProvider for PrometheusObservabilityProvider {
    fn descriptor(&self) -> ObservabilityDescriptor {
        let state = self
            .state
            .read()
            .expect("Prometheus provider state lock poisoned");
        ObservabilityDescriptor {
            extension_id: OBSERVABILITY_EXTENSION_ID.to_string(),
            contract_version: ObservabilityContractVersion::CURRENT,
            provider_id: PROVIDER_ID.to_string(),
            capabilities: vec![ObservabilityCapability {
                signal: ObservabilitySignal::Metrics,
                operations: vec![ObservabilityOperation::Snapshot],
            }],
            target_scopes: Vec::new(),
            freshness: ObservabilityFreshness {
                mode: ObservabilityFreshnessMode::Polling,
                max_age_ms: Some(self.config.refresh_seconds.saturating_mul(2_000)),
            },
            health: state.health,
            observed_at: state.observed_at,
        }
    }

    fn snapshot(&self) -> Result<Vec<ObservabilityEnvelope>, String> {
        Ok(self
            .state
            .read()
            .map_err(|_| "Prometheus provider state lock poisoned".to_string())?
            .envelopes
            .clone())
    }
}

#[derive(Debug, Default)]
struct ModelMetrics {
    usage: BTreeMap<String, f64>,
    cost_usd: Option<f64>,
    cost_kind: Option<&'static str>,
    cost_rate_card_model: Option<String>,
}

struct OpenAiCostEstimate {
    total_usd: f64,
    kind: &'static str,
    rate_card_model: String,
}

fn estimate_openai_cost(
    pricing: &OpenAiPricing,
    model: &str,
    usage: &BTreeMap<String, f64>,
) -> OpenAiCostEstimate {
    let (rates, rate_card_model, used_fallback) = pricing.resolve(model);
    let input = usage.get("input").copied().unwrap_or(0.0).max(0.0);
    let cached_observed = usage.get("cached_input").copied().unwrap_or(0.0).max(0.0);
    let cached_input = cached_observed.min(input);
    let cache_write_observed = usage
        .get("cache_write_input")
        .copied()
        .unwrap_or(0.0)
        .max(0.0);
    let cache_write = cache_write_observed.min(input - cached_input);
    let uncached_input = input - cached_input - cache_write;
    let output = usage.get("output").copied().unwrap_or(0.0).max(0.0);
    let mut total_usd =
        (uncached_input * rates.input + cached_input * rates.cached_input + output * rates.output)
            / 1_000_000.0;
    let mut kind = if used_fallback {
        "estimated_fallback"
    } else {
        "estimated"
    };
    if cache_write > 0.0 {
        if let Some(cache_write_rate) = rates.cache_write {
            total_usd += cache_write * cache_write_rate / 1_000_000.0;
        } else {
            kind = "estimated_partial";
        }
    }
    OpenAiCostEstimate {
        total_usd,
        kind,
        rate_card_model,
    }
}

fn normalize_usage_name(value: &str) -> String {
    match value {
        "cacheCreation" | "cache_creation" | "cache_write" | "cache_write_input" => {
            "cache_write_input"
        }
        "cacheRead" | "cache_read" | "cached_input" => "cached_input",
        "input" | "input_tokens" => "input",
        "output" | "output_tokens" => "output",
        "reasoning_output" => "reasoning_output",
        "total" | "total_tokens" => "total",
        _ => "other",
    }
    .to_string()
}

fn json_number(value: f64) -> serde_json::Value {
    serde_json::Number::from_f64(value.max(0.0))
        .map(serde_json::Value::Number)
        .unwrap_or_else(|| serde_json::Value::from(0))
}

#[derive(Debug, Deserialize)]
struct PrometheusResponse {
    status: String,
    data: Option<PrometheusData>,
    #[serde(rename = "error")]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PrometheusData {
    #[serde(rename = "resultType")]
    result_type: String,
    result: Vec<PrometheusSample>,
}

#[derive(Debug, Deserialize)]
struct PrometheusSample {
    metric: HashMap<String, String>,
    value: Vec<serde_json::Value>,
}

impl PrometheusSample {
    fn value(&self) -> Result<f64, String> {
        let raw = self
            .value
            .get(1)
            .ok_or_else(|| "Prometheus sample is missing its value".to_string())?;
        match raw {
            serde_json::Value::String(value) => value
                .parse::<f64>()
                .map_err(|_| "Prometheus sample value is not numeric".to_string()),
            serde_json::Value::Number(value) => value
                .as_f64()
                .ok_or_else(|| "Prometheus sample value is not finite".to_string()),
            _ => Err("Prometheus sample value has an unexpected type".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_prometheus_credentials_in_endpoint() {
        let result = PrometheusConfig::from_endpoint_and_settings(
            "http://user:pass@localhost:9101",
            None,
            None,
            None,
        );
        assert!(result.unwrap_err().contains("embedded credentials"));
    }

    #[test]
    fn parses_bounded_provider_configuration() {
        let config = PrometheusConfig::from_endpoint_and_settings(
            "http://127.0.0.1:9101",
            Some("3600"),
            Some("10"),
            Some("24"),
        )
        .unwrap();
        assert_eq!(config.endpoint.as_str(), "http://127.0.0.1:9101/");
        assert_eq!(config.window_seconds, 3600);
        assert_eq!(config.refresh_seconds, 10);
        assert_eq!(config.max_models, 24);
    }

    #[test]
    fn normalizes_source_specific_usage_names() {
        assert_eq!(normalize_usage_name("cacheCreation"), "cache_write_input");
        assert_eq!(normalize_usage_name("cache_write"), "cache_write_input");
        assert_eq!(normalize_usage_name("cached_input"), "cached_input");
        assert_eq!(normalize_usage_name("reasoning_output"), "reasoning_output");
        assert_eq!(normalize_usage_name("unexpected"), "other");
    }

    #[test]
    fn estimates_openai_cost_without_double_counting_cached_or_reasoning_tokens() {
        let usage = BTreeMap::from([
            ("input".to_string(), 1_000_000.0),
            ("cached_input".to_string(), 500_000.0),
            ("cache_write_input".to_string(), 100_000.0),
            ("output".to_string(), 200_000.0),
            ("reasoning_output".to_string(), 50_000.0),
        ]);
        let estimate = estimate_openai_cost(&OpenAiPricing::default(), "gpt-5.6-luna", &usage);

        assert_eq!(estimate.kind, "estimated");
        assert_eq!(estimate.rate_card_model, "gpt-5.6-luna");
        assert!((estimate.total_usd - 0.355).abs() < f64::EPSILON);
    }

    #[test]
    fn unknown_openai_models_use_the_disclosed_fallback_rate_card() {
        let usage = BTreeMap::from([("input".to_string(), 1_000_000.0)]);
        let estimate = estimate_openai_cost(&OpenAiPricing::default(), "internal-model", &usage);

        assert_eq!(estimate.kind, "estimated_fallback");
        assert_eq!(estimate.rate_card_model, DEFAULT_OPENAI_FALLBACK_MODEL);
        assert!((estimate.total_usd - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn parses_prometheus_string_sample_values() {
        let sample: PrometheusSample = serde_json::from_value(serde_json::json!({
            "metric": {"model": "gpt-5.6-luna"},
            "value": [1700000000.0, "42.5"]
        }))
        .unwrap();
        assert_eq!(sample.value().unwrap(), 42.5);
    }
}
