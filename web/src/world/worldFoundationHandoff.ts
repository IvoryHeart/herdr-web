import type { QualifiedTarget } from "../runtimeIdentity";
import type { OfficeAgent, OfficeRoomRosterEntry } from "./herdrOfficeProjection";

export type WorldFoundationHandoffRequest =
  | {
      kind: "room";
      key: string;
      profileId: string;
      observedGeneration: string;
      workspaceRef: QualifiedTarget;
    }
  | {
      kind: "agent";
      key: string;
      profileId: string;
      observedGeneration: string;
      terminalRef: QualifiedTarget;
      currentPaneRef: QualifiedTarget;
    };

export function officeAgentFoundationHandoffRequest(
  agent: OfficeAgent,
): Extract<WorldFoundationHandoffRequest, { kind: "agent" }> {
  return {
    kind: "agent",
    key: agent.key,
    profileId: agent.hostKey,
    observedGeneration: agent.observedGeneration,
    terminalRef: agent.currentTerminalRef,
    currentPaneRef: agent.currentPaneRef,
  };
}

export function officeRoomFoundationHandoffRequest(
  room: OfficeRoomRosterEntry,
): Extract<WorldFoundationHandoffRequest, { kind: "room" }> {
  return {
    kind: "room",
    key: room.key,
    profileId: room.hostKey,
    observedGeneration: room.observedGeneration,
    workspaceRef: room.workspaceRef,
  };
}
