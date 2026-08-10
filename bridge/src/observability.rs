use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

pub const OBSERVABILITY_EXTENSION_ID: &str = "observability";
pub const OBSERVABILITY_CONTRACT_MAJOR: u16 = 1;
pub const OBSERVABILITY_CONTRACT_MINOR: u16 = 0;
pub const OBSERVABILITY_BRIDGE_CAPABILITY_VERSION: u32 = 1;
pub const MAX_OBSERVABILITY_ENVELOPES: usize = 1024;
pub const MAX_OBSERVABILITY_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_OBSERVABILITY_ID_BYTES: usize = 256;
const MAX_OBSERVABILITY_NAMESPACE_BYTES: usize = 120;
const MAX_OBSERVABILITY_FIELDS: usize = 64;
const MAX_OBSERVABILITY_DATA_DEPTH: usize = 8;
const MAX_OBSERVABILITY_DATA_COLLECTION: usize = 1024;
const MAX_OBSERVABILITY_DATA_STRING_BYTES: usize = 16 * 1024;
const SENSITIVE_DATA_KEY_FRAGMENTS: &[&str] = &[
    "token",
    "credential",
    "password",
    "secret",
    "authorization",
    "connection",
    "private",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityContractVersion {
    pub major: u16,
    pub minor: u16,
}

impl ObservabilityContractVersion {
    pub const CURRENT: Self = Self {
        major: OBSERVABILITY_CONTRACT_MAJOR,
        minor: OBSERVABILITY_CONTRACT_MINOR,
    };
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityHealth {
    Available,
    Unavailable,
    Degraded,
    Offline,
    Incompatible,
    Unauthorized,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilitySignal {
    Traces,
    Logs,
    Metrics,
    Activity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityOperation {
    Snapshot,
    Events,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityTargetKind {
    Host,
    Workspace,
    Tab,
    Pane,
    Terminal,
    AgentSession,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityCapability {
    pub signal: ObservabilitySignal,
    pub operations: Vec<ObservabilityOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityFreshness {
    pub mode: ObservabilityFreshnessMode,
    pub max_age_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityFreshnessMode {
    Live,
    Polling,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityDescriptor {
    pub extension_id: String,
    pub contract_version: ObservabilityContractVersion,
    pub provider_id: String,
    pub capabilities: Vec<ObservabilityCapability>,
    pub target_scopes: Vec<ObservabilityTargetKind>,
    pub freshness: ObservabilityFreshness,
    pub health: ObservabilityHealth,
    pub observed_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QualifiedObservabilityTarget {
    pub bridge_id: String,
    pub kind: ObservabilityTargetKind,
    pub native_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObservabilityPayload {
    pub namespace: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityTruncationReason {
    SizeLimit,
    FieldLimit,
    RetentionLimit,
    ProviderPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityTruncation {
    pub reason: ObservabilityTruncationReason,
    pub original_bytes: Option<u64>,
    pub fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObservabilityEnvelope {
    pub extension_id: String,
    pub contract_version: ObservabilityContractVersion,
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<QualifiedObservabilityTarget>,
    pub observed_at: u64,
    pub status: ObservabilityHealth,
    pub payload: ObservabilityPayload,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<ObservabilityTruncation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay: Option<ObservabilityReplayInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservabilityReplayInfo {
    pub replayed: bool,
    pub gap: bool,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObservabilitySnapshot {
    pub sequence: u64,
    pub envelopes: Vec<ObservabilityEnvelope>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObservabilityExtensionResponse {
    pub descriptor: ObservabilityDescriptor,
    pub snapshot: ObservabilitySnapshot,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ObservabilityTransportMessage {
    Event {
        event: ObservabilityEnvelope,
    },
    ResyncRequired {
        reason: String,
        after_sequence: Option<u64>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObservabilityValidationError(pub String);

impl std::fmt::Display for ObservabilityValidationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ObservabilityValidationError {}

pub trait ObservabilityProvider: Send + Sync {
    fn descriptor(&self) -> ObservabilityDescriptor;
    fn snapshot(&self) -> Result<Vec<ObservabilityEnvelope>, String>;
}

#[derive(Debug, Default)]
pub struct UnavailableObservabilityProvider;

impl ObservabilityProvider for UnavailableObservabilityProvider {
    fn descriptor(&self) -> ObservabilityDescriptor {
        ObservabilityDescriptor {
            extension_id: OBSERVABILITY_EXTENSION_ID.to_string(),
            contract_version: ObservabilityContractVersion::CURRENT,
            provider_id: "none".to_string(),
            capabilities: Vec::new(),
            target_scopes: Vec::new(),
            freshness: ObservabilityFreshness {
                mode: ObservabilityFreshnessMode::Unknown,
                max_age_ms: None,
            },
            health: ObservabilityHealth::Unavailable,
            observed_at: now_millis(),
        }
    }

    fn snapshot(&self) -> Result<Vec<ObservabilityEnvelope>, String> {
        Ok(Vec::new())
    }
}

#[derive(Clone)]
pub struct ObservabilityState {
    provider: Arc<dyn ObservabilityProvider>,
    event_tx: tokio::sync::broadcast::Sender<ObservabilityTransportMessage>,
    next_snapshot_sequence: Arc<AtomicU64>,
    #[allow(dead_code)]
    next_event_sequence: Arc<AtomicU64>,
}

impl ObservabilityState {
    pub fn unavailable() -> Self {
        Self::with_provider(Arc::new(UnavailableObservabilityProvider))
    }

    pub fn with_provider(provider: Arc<dyn ObservabilityProvider>) -> Self {
        Self {
            provider,
            event_tx: tokio::sync::broadcast::channel(256).0,
            next_snapshot_sequence: Arc::new(AtomicU64::new(0)),
            next_event_sequence: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn descriptor(&self) -> Result<ObservabilityDescriptor, ObservabilityValidationError> {
        let descriptor = self.provider.descriptor();
        validate_descriptor(&descriptor)?;
        Ok(descriptor)
    }

    pub fn snapshot(&self) -> Result<ObservabilityExtensionResponse, ObservabilityValidationError> {
        let mut descriptor = self.provider.descriptor();
        validate_descriptor(&descriptor)?;
        let envelopes = match self.provider.snapshot() {
            Ok(envelopes) => envelopes,
            Err(_) => {
                if descriptor.health == ObservabilityHealth::Available {
                    descriptor.health = ObservabilityHealth::Degraded;
                }
                Vec::new()
            }
        };
        if envelopes.len() > MAX_OBSERVABILITY_ENVELOPES {
            return Err(ObservabilityValidationError(
                "observability snapshot contains too many envelopes".to_string(),
            ));
        }
        for envelope in &envelopes {
            validate_envelope_for_descriptor(envelope, &descriptor, false)?;
        }
        let sequence = self
            .next_snapshot_sequence
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        Ok(ObservabilityExtensionResponse {
            descriptor,
            snapshot: ObservabilitySnapshot {
                sequence,
                envelopes,
            },
        })
    }

    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<ObservabilityTransportMessage> {
        self.event_tx.subscribe()
    }

    #[allow(dead_code)]
    pub fn publish_event(
        &self,
        mut event: ObservabilityEnvelope,
    ) -> Result<u64, ObservabilityValidationError> {
        let descriptor = self.descriptor()?;
        validate_envelope_for_descriptor(&event, &descriptor, false)?;
        let sequence = self
            .next_event_sequence
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        event.sequence = Some(sequence);
        let _ = self
            .event_tx
            .send(ObservabilityTransportMessage::Event { event });
        Ok(sequence)
    }
}

pub fn validate_descriptor(
    descriptor: &ObservabilityDescriptor,
) -> Result<(), ObservabilityValidationError> {
    if descriptor.extension_id != OBSERVABILITY_EXTENSION_ID {
        return Err(ObservabilityValidationError(
            "unsupported observability extension id".to_string(),
        ));
    }
    validate_contract_version(descriptor.contract_version)?;
    validate_safe_id(&descriptor.provider_id, "provider_id")?;
    if descriptor.capabilities.len() > 32 || descriptor.target_scopes.len() > 6 {
        return Err(ObservabilityValidationError(
            "observability descriptor contains too many capabilities or scopes".to_string(),
        ));
    }
    let mut capability_keys = HashSet::new();
    for capability in &descriptor.capabilities {
        if capability.operations.is_empty() || capability.operations.len() > 2 {
            return Err(ObservabilityValidationError(
                "observability capability must advertise one or two operations".to_string(),
            ));
        }
        let mut operations = HashSet::new();
        for operation in &capability.operations {
            if !operations.insert(*operation) {
                return Err(ObservabilityValidationError(
                    "observability capability repeats an operation".to_string(),
                ));
            }
        }
        if !capability_keys.insert(capability.signal) {
            return Err(ObservabilityValidationError(
                "observability descriptor repeats a signal".to_string(),
            ));
        }
    }
    let mut scopes = HashSet::new();
    for scope in &descriptor.target_scopes {
        if !scopes.insert(*scope) {
            return Err(ObservabilityValidationError(
                "observability descriptor repeats a target scope".to_string(),
            ));
        }
    }
    Ok(())
}

pub fn validate_contract_version(
    version: ObservabilityContractVersion,
) -> Result<(), ObservabilityValidationError> {
    if version.major != OBSERVABILITY_CONTRACT_MAJOR {
        return Err(ObservabilityValidationError(format!(
            "observability contract major {} is incompatible",
            version.major
        )));
    }
    Ok(())
}

pub fn validate_envelope(
    envelope: &ObservabilityEnvelope,
) -> Result<(), ObservabilityValidationError> {
    validate_contract_version(envelope.contract_version)?;
    if envelope.extension_id != OBSERVABILITY_EXTENSION_ID {
        return Err(ObservabilityValidationError(
            "unsupported observability envelope extension id".to_string(),
        ));
    }
    validate_safe_id(&envelope.provider_id, "provider_id")?;
    validate_payload(&envelope.payload)?;
    if let Some(target) = &envelope.target {
        validate_target(target)?;
    }
    if let Some(truncated) = &envelope.truncated {
        if truncated.fields.len() > MAX_OBSERVABILITY_FIELDS {
            return Err(ObservabilityValidationError(
                "observability truncation lists too many fields".to_string(),
            ));
        }
        for field in &truncated.fields {
            validate_safe_id(field, "truncated field")?;
        }
    }
    if let Some(replay) = &envelope.replay {
        if let Some(cursor) = &replay.cursor {
            validate_safe_id(cursor, "replay cursor")?;
        }
    }
    Ok(())
}

fn validate_envelope_for_descriptor(
    envelope: &ObservabilityEnvelope,
    descriptor: &ObservabilityDescriptor,
    require_sequence: bool,
) -> Result<(), ObservabilityValidationError> {
    validate_envelope(envelope)?;
    if envelope.provider_id != descriptor.provider_id
        || envelope.contract_version.major != descriptor.contract_version.major
    {
        return Err(ObservabilityValidationError(
            "observability envelope does not match its descriptor".to_string(),
        ));
    }
    if let Some(target) = &envelope.target {
        if !descriptor.target_scopes.contains(&target.kind) {
            return Err(ObservabilityValidationError(
                "observability envelope target is outside advertised scopes".to_string(),
            ));
        }
    }
    if require_sequence && envelope.sequence.unwrap_or(0) == 0 {
        return Err(ObservabilityValidationError(
            "observability event is missing a sequence".to_string(),
        ));
    }
    Ok(())
}

fn validate_target(
    target: &QualifiedObservabilityTarget,
) -> Result<(), ObservabilityValidationError> {
    validate_safe_id(&target.bridge_id, "bridge_id")?;
    validate_safe_id(&target.native_id, "native_id")
}

fn validate_payload(payload: &ObservabilityPayload) -> Result<(), ObservabilityValidationError> {
    if payload.namespace.is_empty()
        || payload.namespace.len() > MAX_OBSERVABILITY_NAMESPACE_BYTES
        || !payload.namespace.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || ".-_".contains(character)
        })
        || !payload
            .namespace
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
    {
        return Err(ObservabilityValidationError(
            "observability payload namespace is invalid".to_string(),
        ));
    }
    let encoded = serde_json::to_vec(&payload.data).map_err(|_| {
        ObservabilityValidationError("observability payload is not serializable".to_string())
    })?;
    if encoded.len() > MAX_OBSERVABILITY_PAYLOAD_BYTES {
        return Err(ObservabilityValidationError(
            "observability payload exceeds the browser size limit".to_string(),
        ));
    }
    validate_payload_data(&payload.data, 0)?;
    Ok(())
}

fn validate_payload_data(
    value: &serde_json::Value,
    depth: usize,
) -> Result<(), ObservabilityValidationError> {
    if depth > MAX_OBSERVABILITY_DATA_DEPTH {
        return Err(ObservabilityValidationError(
            "observability payload is nested too deeply".to_string(),
        ));
    }
    match value {
        serde_json::Value::Array(items) => {
            if items.len() > MAX_OBSERVABILITY_DATA_COLLECTION {
                return Err(ObservabilityValidationError(
                    "observability payload contains too many items".to_string(),
                ));
            }
            for item in items {
                validate_payload_data(item, depth + 1)?;
            }
        }
        serde_json::Value::Object(fields) => {
            if fields.len() > MAX_OBSERVABILITY_DATA_COLLECTION {
                return Err(ObservabilityValidationError(
                    "observability payload contains too many fields".to_string(),
                ));
            }
            for (key, field) in fields {
                let lowered = key.to_ascii_lowercase();
                if SENSITIVE_DATA_KEY_FRAGMENTS
                    .iter()
                    .any(|fragment| lowered.contains(fragment))
                {
                    return Err(ObservabilityValidationError(
                        "observability payload contains a sensitive field".to_string(),
                    ));
                }
                validate_safe_id(key, "payload field")?;
                validate_payload_data(field, depth + 1)?;
            }
        }
        serde_json::Value::String(text) if text.len() > MAX_OBSERVABILITY_DATA_STRING_BYTES => {
            return Err(ObservabilityValidationError(
                "observability payload contains an oversized string".to_string(),
            ));
        }
        _ => {}
    }
    Ok(())
}

fn validate_safe_id(value: &str, field: &str) -> Result<(), ObservabilityValidationError> {
    if value.is_empty()
        || value.len() > MAX_OBSERVABILITY_ID_BYTES
        || value.chars().any(|character| character.is_control())
    {
        return Err(ObservabilityValidationError(format!(
            "observability {field} is invalid"
        )));
    }
    Ok(())
}

pub(crate) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_the_downstream_fixture() {
        let response: ObservabilityExtensionResponse = serde_json::from_str(include_str!(
            "../../contracts/observability/v1/fixtures/available-snapshot.json"
        ))
        .unwrap();
        validate_descriptor(&response.descriptor).unwrap();
        assert_eq!(response.snapshot.envelopes.len(), 1);
        validate_envelope_for_descriptor(
            &response.snapshot.envelopes[0],
            &response.descriptor,
            false,
        )
        .unwrap();
    }

    #[test]
    fn accepts_a_server_shaped_provider_with_a_compatible_minor_version() {
        let response: ObservabilityExtensionResponse = serde_json::from_str(include_str!(
            "../../contracts/observability/v1/fixtures/server-shaped-snapshot.json"
        ))
        .unwrap();
        validate_descriptor(&response.descriptor).unwrap();
        validate_envelope_for_descriptor(
            &response.snapshot.envelopes[0],
            &response.descriptor,
            false,
        )
        .unwrap();
    }

    #[test]
    fn rejects_malformed_and_major_mismatch_fixtures() {
        assert!(
            serde_json::from_str::<ObservabilityExtensionResponse>(include_str!(
                "../../contracts/observability/v1/fixtures/malformed-envelope.json"
            ))
            .is_err()
        );

        let mismatch: ObservabilityExtensionResponse = serde_json::from_str(include_str!(
            "../../contracts/observability/v1/fixtures/major-mismatch.json"
        ))
        .unwrap();
        assert!(validate_descriptor(&mismatch.descriptor).is_err());
    }

    #[test]
    fn unavailable_provider_is_explicit_and_empty() {
        let state = ObservabilityState::unavailable();
        let response = state.snapshot().unwrap();
        assert_eq!(response.descriptor.health, ObservabilityHealth::Unavailable);
        assert!(response.descriptor.capabilities.is_empty());
        assert!(response.snapshot.envelopes.is_empty());
    }

    #[test]
    fn published_events_are_sequenced_for_recovery() {
        let state = ObservabilityState::unavailable();
        let mut receiver = state.subscribe();
        let event = ObservabilityEnvelope {
            extension_id: OBSERVABILITY_EXTENSION_ID.to_string(),
            contract_version: ObservabilityContractVersion::CURRENT,
            provider_id: "none".to_string(),
            target: None,
            observed_at: 1,
            status: ObservabilityHealth::Unavailable,
            payload: ObservabilityPayload {
                namespace: "activity.summary".to_string(),
                data: serde_json::json!({}),
            },
            truncated: None,
            sequence: None,
            replay: None,
        };
        assert_eq!(state.publish_event(event).unwrap(), 1);
        let ObservabilityTransportMessage::Event { event } = receiver.try_recv().unwrap() else {
            panic!("expected observability event")
        };
        assert_eq!(event.sequence, Some(1));
    }

    #[test]
    fn provider_failure_is_degraded_without_failing_the_extension_boundary() {
        struct FailingProvider;

        impl ObservabilityProvider for FailingProvider {
            fn descriptor(&self) -> ObservabilityDescriptor {
                ObservabilityDescriptor {
                    extension_id: OBSERVABILITY_EXTENSION_ID.to_string(),
                    contract_version: ObservabilityContractVersion::CURRENT,
                    provider_id: "fixture.failing".to_string(),
                    capabilities: Vec::new(),
                    target_scopes: Vec::new(),
                    freshness: ObservabilityFreshness {
                        mode: ObservabilityFreshnessMode::Polling,
                        max_age_ms: Some(1_000),
                    },
                    health: ObservabilityHealth::Available,
                    observed_at: 1,
                }
            }

            fn snapshot(&self) -> Result<Vec<ObservabilityEnvelope>, String> {
                Err("provider backend unavailable".to_string())
            }
        }

        let response = ObservabilityState::with_provider(Arc::new(FailingProvider))
            .snapshot()
            .unwrap();
        assert_eq!(response.descriptor.health, ObservabilityHealth::Degraded);
        assert!(response.snapshot.envelopes.is_empty());
    }

    #[test]
    fn rejects_targets_outside_the_provider_scope() {
        let mut response: ObservabilityExtensionResponse = serde_json::from_str(include_str!(
            "../../contracts/observability/v1/fixtures/available-snapshot.json"
        ))
        .unwrap();
        response.snapshot.envelopes[0].target = Some(QualifiedObservabilityTarget {
            bridge_id: "host-a".to_string(),
            kind: ObservabilityTargetKind::Workspace,
            native_id: "workspace-1".to_string(),
        });
        assert!(validate_envelope_for_descriptor(
            &response.snapshot.envelopes[0],
            &response.descriptor,
            false,
        )
        .is_err());
    }

    #[test]
    fn browser_facing_serialization_contains_no_provider_credentials() {
        let response = ObservabilityState::unavailable().snapshot().unwrap();
        let encoded = serde_json::to_string(&response).unwrap();
        for forbidden in ["token", "credential", "connection_string", "key_material"] {
            assert!(!encoded.contains(forbidden));
        }
    }

    #[test]
    fn rejects_credential_shaped_provider_data() {
        let mut response: ObservabilityExtensionResponse = serde_json::from_str(include_str!(
            "../../contracts/observability/v1/fixtures/available-snapshot.json"
        ))
        .unwrap();
        response.snapshot.envelopes[0].payload.data = serde_json::json!({
            "token": "should never reach the browser"
        });
        assert!(validate_envelope_for_descriptor(
            &response.snapshot.envelopes[0],
            &response.descriptor,
            false,
        )
        .is_err());
    }
}
