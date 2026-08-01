import type { BridgeRuntime } from "./bridge";
import type { PaneInfo } from "./types";
import { qualifyRuntimeTarget, qualifiedRuntimeKey } from "./runtimeIdentity";
import type { RuntimeAdmissionState, RuntimeLoadState } from "./runtimeClient";
import { runtimeFeatureReady } from "./runtimeClient";

export type TerminalSessionDescriptor = {
  profileId: string;
  connectionKey: string;
  terminalId: string;
  sessionKey: string;
  attachEnabled: boolean;
  inputEnabled: boolean;
  resizeEnabled: boolean;
  scrollEnabled: boolean;
  uploadEnabled: boolean;
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
  const attachEnabled = runtimeFeatureReady(
    runtime,
    state,
    "terminal_attach",
    requiredCapabilities,
  );
  return {
    profileId: runtime.id,
    connectionKey: runtime.generationKey,
    terminalId: pane.terminal_id,
    sessionKey: terminalSessionKey(runtime.id, runtime.generationKey, pane.terminal_id),
    attachEnabled,
    inputEnabled:
      attachEnabled && runtimeFeatureReady(runtime, state, "terminal_input", requiredCapabilities),
    resizeEnabled:
      attachEnabled && runtimeFeatureReady(runtime, state, "terminal_resize", requiredCapabilities),
    scrollEnabled:
      attachEnabled && runtimeFeatureReady(runtime, state, "terminal_scroll", requiredCapabilities),
    uploadEnabled:
      attachEnabled &&
      runtimeFeatureReady(runtime, state, "terminal_input", requiredCapabilities) &&
      runtimeFeatureReady(runtime, state, "uploads", requiredCapabilities),
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
