import type { BridgeRuntime } from "./bridge";
import type { PaneInfo } from "./types";
import { qualifyRuntimeTarget, qualifiedRuntimeKey } from "./runtimeIdentity";
import type { RuntimeAdmissionState, RuntimeLoadState } from "./runtimeClient";
import { runtimeAdmissionReady } from "./runtimeClient";

export type TerminalSessionDescriptor = {
  profileId: string;
  connectionKey: string;
  terminalId: string;
  sessionKey: string;
  inputEnabled: boolean;
};

export function terminalSessionDescriptor(
  runtime: BridgeRuntime | null,
  pane: PaneInfo | null,
  admission: RuntimeAdmissionState | RuntimeLoadState,
  requiredCapabilities: readonly string[] = [],
): TerminalSessionDescriptor | null {
  if (!runtime || !pane) {
    return null;
  }
  const state =
    typeof admission === "string"
      ? {
          connectionKey: runtime.generationKey,
          snapshot: admission === "ready" ? {} : null,
          loadState: admission,
        }
      : admission;
  return {
    profileId: runtime.id,
    connectionKey: runtime.generationKey,
    terminalId: pane.terminal_id,
    sessionKey: terminalSessionKey(runtime.id, runtime.generationKey, pane.terminal_id),
    inputEnabled: runtimeAdmissionReady(runtime, state, requiredCapabilities),
  };
}

export function terminalSessionKey(
  profileId: string,
  connectionKey: string,
  terminalId: string,
) {
  return `${connectionKey}:${qualifiedRuntimeKey(
    qualifyRuntimeTarget(profileId, "terminal", terminalId),
  )}`;
}
