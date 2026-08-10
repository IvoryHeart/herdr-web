import availableFixture from "../../contracts/observability/v1/fixtures/available-snapshot.json";
import serverFixture from "../../contracts/observability/v1/fixtures/server-shaped-snapshot.json";
import malformedFixture from "../../contracts/observability/v1/fixtures/malformed-envelope.json";
import majorMismatchFixture from "../../contracts/observability/v1/fixtures/major-mismatch.json";
import { describe, expect, it, vi } from "vitest";
import {
  fetchObservabilitySnapshot,
  parseObservabilityExtensionResponse,
  parseObservabilityTransportMessage,
  ObservabilityContractError,
} from "./observability";

describe("observability contract", () => {
  it("consumes the downstream fixture", () => {
    const response = parseObservabilityExtensionResponse(availableFixture);
    expect(response.descriptor.provider_id).toBe("fixture.downstream");
    expect(response.snapshot.envelopes[0]?.target?.bridge_id).toBe("host-a");
  });

  it("fetches the browser-facing snapshot boundary without exposing backend details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(availableFixture), { status: 200 }),
    );
    await expect(fetchObservabilitySnapshot((path) => path)).resolves.toMatchObject({
      descriptor: { extension_id: "observability" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/extensions/observability/snapshot",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fetchMock.mockRestore();
  });

  it("consumes the same contract from a server-shaped provider", () => {
    const response = parseObservabilityExtensionResponse(serverFixture);
    expect(response.descriptor.contract_version.minor).toBe(1);
    expect(response.descriptor.provider_id).toBe("herdr-server.observability");
  });

  it("rejects malformed and incompatible provider payloads", () => {
    expect(() => parseObservabilityExtensionResponse(malformedFixture)).toThrow(
      ObservabilityContractError,
    );
    expect(() => parseObservabilityExtensionResponse(majorMismatchFixture)).toThrow(
      ObservabilityContractError,
    );
  });

  it("requires a sequence on live events and accepts resync notices", () => {
    expect(() =>
      parseObservabilityTransportMessage({
        type: "event",
        event: (availableFixture as { snapshot: { envelopes: unknown[] } }).snapshot.envelopes[0],
      }),
    ).toThrow("missing a sequence");
    expect(
      parseObservabilityTransportMessage({
        type: "resync_required",
        reason: "event_gap",
        after_sequence: 4,
      }),
    ).toEqual({ type: "resync_required", reason: "event_gap", after_sequence: 4 });
  });

  it("preserves explicit truncation metadata while bounding provider data", () => {
    const fixture = structuredClone(availableFixture) as {
      snapshot: { envelopes: Array<Record<string, unknown>> };
    };
    fixture.snapshot.envelopes[0] = {
      ...fixture.snapshot.envelopes[0],
      truncated: {
        reason: "field_limit",
        original_bytes: 128_000,
        fields: ["trace.attributes"],
      },
    };
    expect(parseObservabilityExtensionResponse(fixture).snapshot.envelopes[0]?.truncated).toEqual({
      reason: "field_limit",
      original_bytes: 128_000,
      fields: ["trace.attributes"],
    });
  });

  it("rejects credential-shaped provider data before it reaches a projection", () => {
    const fixture = structuredClone(availableFixture) as {
      snapshot: { envelopes: Array<Record<string, unknown>> };
    };
    fixture.snapshot.envelopes[0] = {
      ...fixture.snapshot.envelopes[0],
      payload: { namespace: "activity.summary", data: { token: "not allowed" } },
    };
    expect(() => parseObservabilityExtensionResponse(fixture)).toThrow("sensitive field");
  });
});
