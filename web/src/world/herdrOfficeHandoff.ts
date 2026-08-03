import type { BridgeRuntime } from "../bridge";
import { isAgentPane } from "../agentDetection";
import { runtimeAdmissionReady } from "../runtimeClient";
import type { BridgeConnectionState } from "../runtimeConnection";
import type { QualifiedTarget } from "../runtimeIdentity";
import type { PaneInfo, WorkspaceInfo } from "../types";
import type { OfficeAgent, OfficeRoomRosterEntry } from "./herdrOfficeProjection";

const SPACES_HANDOFF_CAPABILITIES = ["snapshot", "terminal_attach"] as const;

type HandoffBase = {
  key: string;
  profileId: string;
  observedGeneration: string;
};

export type OfficeHandoffRequest =
  | (HandoffBase & {
      kind: "room";
      workspaceRef: QualifiedTarget;
    })
  | (HandoffBase & {
      kind: "agent";
      terminalRef: QualifiedTarget;
      currentPaneRef: QualifiedTarget;
    });

export function officeAgentHandoffRequest(
  agent: OfficeAgent,
): Extract<OfficeHandoffRequest, { kind: "agent" }> {
  return {
    kind: "agent",
    key: agent.key,
    profileId: agent.hostKey,
    observedGeneration: agent.observedGeneration,
    terminalRef: agent.currentTerminalRef,
    currentPaneRef: agent.currentPaneRef,
  };
}

export function officeRoomHandoffRequest(
  room: OfficeRoomRosterEntry,
): Extract<OfficeHandoffRequest, { kind: "room" }> {
  return {
    kind: "room",
    key: room.key,
    profileId: room.hostKey,
    observedGeneration: room.observedGeneration,
    workspaceRef: room.workspaceRef,
  };
}

export type OfficeHandoffResolution =
  | {
      ok: true;
      kind: "room";
      runtime: BridgeRuntime;
      workspace: WorkspaceInfo;
    }
  | {
      ok: true;
      kind: "agent";
      runtime: BridgeRuntime;
      workspace: WorkspaceInfo;
      pane: PaneInfo;
    }
  | {
      ok: false;
      reason: "invalid" | "reconnected" | "unavailable" | "missing";
      message: string;
    };

export function resolveOfficeHandoff(
  request: OfficeHandoffRequest,
  runtime: BridgeRuntime | null,
  state: BridgeConnectionState | null | undefined,
): OfficeHandoffResolution {
  if (
    !runtime ||
    request.profileId !== runtime.id ||
    (request.kind === "room" && request.workspaceRef.profileId !== request.profileId) ||
    (request.kind === "agent" &&
      (request.terminalRef.profileId !== request.profileId ||
        request.currentPaneRef.profileId !== request.profileId))
  ) {
    return failure("invalid", "The qualified World target is no longer valid.");
  }
  if (request.observedGeneration !== runtime.generationKey) {
    return failure(
      "reconnected",
      "This host reconnected. Review the refreshed World selection and try again.",
    );
  }
  if (!runtimeAdmissionReady(runtime, state, SPACES_HANDOFF_CAPABILITIES)) {
    return failure(
      "unavailable",
      "This host is not live and Spaces-compatible. World remains open.",
    );
  }

  const snapshot = state?.snapshot;
  if (!snapshot) {
    return failure("unavailable", "The latest admitted Herdr snapshot is unavailable.");
  }
  if (request.kind === "room") {
    const workspace = snapshot.workspaces.find(
      (entry) => entry.workspace_id === request.workspaceRef.nativeTargetId,
    );
    return workspace
      ? { ok: true, kind: "room", runtime, workspace }
      : failure("missing", "That workspace is no longer present in the latest admitted snapshot.");
  }

  const pane = snapshot.panes.find(
    (entry) => entry.terminal_id === request.terminalRef.nativeTargetId && isAgentPane(entry),
  );
  const workspace = pane
    ? snapshot.workspaces.find((entry) => entry.workspace_id === pane.workspace_id)
    : null;
  return pane && workspace
    ? { ok: true, kind: "agent", runtime, workspace, pane }
    : failure("missing", "That agent is no longer present in the latest admitted snapshot.");
}

function failure(
  reason: Extract<OfficeHandoffResolution, { ok: false }>["reason"],
  message: string,
): OfficeHandoffResolution {
  return { ok: false, reason, message };
}
