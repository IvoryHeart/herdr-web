import { describe, expect, it } from "vitest";
import { parseObservabilityExtensionResponse } from "../observability";
import {
  aggregateOfficeObservability,
  formatOfficeCost,
  formatOfficeModelNames,
  formatOfficeUsage,
} from "./officeObservability";

function response(models: unknown[], observedAt: number) {
  return parseObservabilityExtensionResponse({
    descriptor: {
      extension_id: "observability",
      contract_version: { major: 1, minor: 0 },
      provider_id: "prometheus.otel",
      capabilities: [{ signal: "metrics", operations: ["snapshot"] }],
      target_scopes: [],
      freshness: { mode: "polling", max_age_ms: 60_000 },
      health: "available",
      observed_at: observedAt,
    },
    snapshot: {
      sequence: 1,
      envelopes: [{
        extension_id: "observability",
        contract_version: { major: 1, minor: 0 },
        provider_id: "prometheus.otel",
        observed_at: observedAt,
        status: "available",
        payload: {
          namespace: "herdr-world.otel.metrics",
          data: {
            source: "prometheus",
            aggregation: "configured_source",
            window_seconds: 86_400,
            models,
          },
        },
      }],
    },
  });
}

describe("Office observability projection", () => {
  it("aggregates model usage and cost without inventing agent targets", () => {
    const result = aggregateOfficeObservability([
      {
        response: response([
          { provider: "openai", model: "gpt-5.6-luna", usage: { total: 100 } },
          {
            provider: "anthropic",
            model: "claude-opus-5",
            usage: { input: 10 },
            cost_usd: 0.4,
            cost_kind: "reported",
          },
        ], 10),
      },
      {
        response: response([
          { provider: "openai", model: "gpt-5.6-luna", usage: { total: 50 } },
        ], 20),
      },
    ]);

    expect(result.health).toBe("available");
    expect(result.providerId).toBe("prometheus.otel");
    expect(result.sourceCount).toBe(2);
    expect(result.configuredSourceCount).toBe(2);
    expect(result.failedSourceCount).toBe(0);
    expect(result.observedAt).toBe(20);
    expect(result.totalCostUsd).toBe(0.4);
    expect(result.totalUsage).toBe(160);
    expect(result.models).toEqual([
      {
        provider: "anthropic",
        model: "claude-opus-5",
        usage: { input: 10 },
        costUsd: 0.4,
        costKind: "reported",
      },
      {
        provider: "openai",
        model: "gpt-5.6-luna",
        usage: { total: 150 },
        costUsd: null,
        costKind: null,
      },
    ]);
  });

  it("marks partial source failures degraded while retaining good source data", () => {
    const result = aggregateOfficeObservability([
      { response: response([{ provider: "openai", model: "gpt-5.6-sol", usage: { total: 4 } }], 5) },
      { failed: true },
    ]);

    expect(result.health).toBe("degraded");
    expect(result.sourceCount).toBe(2);
    expect(result.configuredSourceCount).toBe(1);
    expect(result.failedSourceCount).toBe(1);
    expect(result.models).toHaveLength(1);
  });

  it("formats board values into compact, legible labels", () => {
    expect(formatOfficeCost(8.984)).toBe("$8.98");
    expect(formatOfficeCost(8.984, "estimated")).toBe("~$8.98");
    expect(formatOfficeCost(null)).toBe("—");
    expect(formatOfficeUsage(252_421_215)).toBe("252.4M");
    expect(formatOfficeUsage(900)).toBe("900");
    expect(formatOfficeModelNames([
      { provider: "openai", model: "gpt-5.6-luna", usage: {}, costUsd: null, costKind: null },
      { provider: "openai", model: "gpt-5.6-sol", usage: {}, costUsd: null, costKind: null },
      { provider: "anthropic", model: "claude-opus-5", usage: {}, costUsd: null, costKind: null },
      { provider: "anthropic", model: "claude-sonnet-5", usage: {}, costUsd: null, costKind: null },
    ])).toBe("luna · sol · opus-5 · +1");
  });
});
