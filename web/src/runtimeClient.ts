import type { BridgeRuntime, CapabilityState } from "./bridge";

export type RuntimeLoadState = "loading" | "ready" | "error";

export type HostConnectionState =
  | "disabled"
  | "connecting"
  | "compatible"
  | "degraded"
  | "incompatible"
  | "offline";

export type RuntimeCacheEntry<Snapshot> = {
  profileId: string;
  connectionKey: string;
  snapshot: Snapshot | null;
  stale: boolean;
  admittedAt: number | null;
};

/**
 * Browser-owned cache metadata only. Snapshots are replaced by admitted Herdr
 * state and mutations are never written here as authoritative topology.
 */
export class RuntimeCache<Snapshot> {
  readonly #entries = new Map<string, RuntimeCacheEntry<Snapshot>>();

  configure(profileId: string, connectionKey: string) {
    const current = this.#entries.get(profileId);
    if (current?.connectionKey === connectionKey) {
      return current;
    }
    const next: RuntimeCacheEntry<Snapshot> = {
      profileId,
      connectionKey,
      snapshot: null,
      stale: false,
      admittedAt: null,
    };
    this.#entries.set(profileId, next);
    return next;
  }

  admitSnapshot(profileId: string, connectionKey: string, snapshot: Snapshot, admittedAt = Date.now()) {
    const current = this.#entries.get(profileId);
    if (!current || current.connectionKey !== connectionKey) {
      return false;
    }
    this.#entries.set(profileId, {
      ...current,
      snapshot,
      stale: false,
      admittedAt,
    });
    return true;
  }

  markUnavailable(profileId: string, connectionKey: string) {
    const current = this.#entries.get(profileId);
    if (!current || current.connectionKey !== connectionKey) {
      return false;
    }
    this.#entries.set(profileId, { ...current, stale: current.snapshot !== null });
    return true;
  }

  get(profileId: string) {
    return this.#entries.get(profileId) ?? null;
  }

  remove(profileId: string) {
    this.#entries.delete(profileId);
  }
}

export function hostConnectionState(
  capabilityState: CapabilityState,
  loadState: RuntimeLoadState,
  hasSnapshot: boolean,
): HostConnectionState {
  if (capabilityState === "incompatible") {
    return "incompatible";
  }
  if (capabilityState === "offline") {
    return "offline";
  }
  if (capabilityState === "error") {
    return hasSnapshot ? "degraded" : "offline";
  }
  if (capabilityState !== "ready" || loadState === "loading") {
    return "connecting";
  }
  if (loadState === "error") {
    return "offline";
  }
  return "compatible";
}

export function runtimeControlsEnabled(runtime: BridgeRuntime | null, loadState: RuntimeLoadState) {
  return Boolean(
    runtime &&
      runtime.canConnect &&
      runtime.capabilityState === "ready" &&
      loadState === "ready",
  );
}
