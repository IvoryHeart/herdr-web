import type {
  SurfaceHostV1,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import {
  hasStoredWorldSettings,
  readWorldSettings,
} from "./worldSettingsState";

export type FoundationWorldSettingsSyncState = {
  applied: Map<string, string>;
  inFlight: Map<string, Promise<void>>;
};

export function createFoundationWorldSettingsSyncState(): FoundationWorldSettingsSyncState {
  return {
    applied: new Map(),
    inFlight: new Map(),
  };
}

/**
 * Preserve the legacy per-bridge Office settings migration while using only
 * Foundation's public extension request boundary.
 */
export async function synchronizeStoredFoundationWorldSettings(
  host: SurfaceHostV1,
  runtimes: readonly SurfaceRuntimeView[],
  state: FoundationWorldSettingsSyncState,
) {
  await Promise.all(runtimes.map((runtime) => synchronizeRuntime(host, runtime, state)));
}

async function synchronizeRuntime(
  host: SurfaceHostV1,
  runtime: SurfaceRuntimeView,
  state: FoundationWorldSettingsSyncState,
) {
  const bridgeId = runtime.identity.bridgeId;
  const existing = state.inFlight.get(bridgeId);
  if (existing) await existing;
  if (
    runtime.state !== "ready" ||
    !runtime.features.includes("observability_extension") ||
    !hasStoredWorldSettings(bridgeId)
  ) return;

  const settings = readWorldSettings(bridgeId);
  if (!settings) return;
  const value = settings.prometheusUrl ?? "";
  const marker = `${runtime.identity.generationKey}:${value}`;
  if (state.applied.get(bridgeId) === marker) return;

  state.applied.set(bridgeId, marker);
  const request = host.extensions.request({
    runtime: runtime.identity,
    extensionId: "observability",
    operation: "config-update",
    body: { prometheus_url: settings.prometheusUrl },
  })
    .then(() => undefined)
    .catch(() => {
      if (state.applied.get(bridgeId) === marker) state.applied.delete(bridgeId);
    });
  state.inFlight.set(bridgeId, request);
  try {
    await request;
  } finally {
    if (state.inFlight.get(bridgeId) === request) state.inFlight.delete(bridgeId);
  }
}
