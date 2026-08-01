import type { BridgeId, BridgeRuntime } from "./bridge";

export type RuntimeEntityKind = "workspace" | "tab" | "pane" | "terminal" | "agent";

export type QualifiedTarget = {
  profileId: BridgeId;
  kind: RuntimeEntityKind;
  nativeTargetId: string;
};

export type RuntimeRouteFailure =
  | "invalid_target"
  | "unknown_profile"
  | "host_unavailable"
  | "unsupported_command";

export class RuntimeRouteError extends Error {
  readonly reason: RuntimeRouteFailure;

  constructor(reason: RuntimeRouteFailure, message: string) {
    super(message);
    this.name = "RuntimeRouteError";
    this.reason = reason;
  }
}

export function qualifyRuntimeTarget(
  profileId: BridgeId,
  kind: RuntimeEntityKind,
  nativeTargetId: string,
): QualifiedTarget {
  if (!profileId.trim() || !nativeTargetId.trim()) {
    throw new RuntimeRouteError("invalid_target", "Runtime target identifiers must not be empty");
  }
  return { profileId, kind, nativeTargetId };
}

/**
 * A collision-safe browser key. JSON tuple encoding avoids delimiter ambiguity
 * while keeping the profile qualification visible in diagnostics and tests.
 */
export function qualifiedRuntimeKey(target: QualifiedTarget): string {
  return JSON.stringify([target.profileId, target.kind, target.nativeTargetId]);
}

export function routeQualifiedTarget(
  target: QualifiedTarget,
  runtimes: readonly BridgeRuntime[],
  requiredCommand?: string,
): BridgeRuntime {
  const runtime = runtimes.find((candidate) => candidate.id === target.profileId);
  if (!runtime) {
    throw new RuntimeRouteError("unknown_profile", "Target host profile is not configured");
  }
  if (!runtime.canConnect || runtime.capabilityState !== "ready") {
    throw new RuntimeRouteError("host_unavailable", "Target host is not ready");
  }
  if (requiredCommand && !runtime.capabilities?.commands.includes(requiredCommand)) {
    throw new RuntimeRouteError(
      "unsupported_command",
      "Target host does not advertise the requested command",
    );
  }
  return runtime;
}
