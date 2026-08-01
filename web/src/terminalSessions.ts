import type { BridgeRuntime } from "./bridge";
import type { PaneInfo } from "./types";
import { qualifyRuntimeTarget, qualifiedRuntimeKey } from "./runtimeIdentity";
import type { RuntimeLoadState } from "./runtimeClient";
import { runtimeControlsEnabled } from "./runtimeClient";

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
  loadState: RuntimeLoadState,
): TerminalSessionDescriptor | null {
  if (!runtime || !pane) {
    return null;
  }
  return {
    profileId: runtime.id,
    connectionKey: runtime.connectionKey,
    terminalId: pane.terminal_id,
    sessionKey: terminalSessionKey(runtime.id, runtime.connectionKey, pane.terminal_id),
    inputEnabled: runtimeControlsEnabled(runtime, loadState),
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
