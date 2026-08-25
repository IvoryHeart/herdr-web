import type {
  OfficeAgent,
  OfficeRoomRosterEntry,
} from "./herdrOfficeProjection";
import type { QualifiedTarget } from "../runtimeIdentity";
import type {
  SurfaceHostV1,
  SurfaceRuntimeView,
  SurfaceShellTarget,
} from "@herdr-world/foundation/surfaces";

export type FoundationOfficeHandoffRequest =
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

export function foundationOfficeAgentHandoffRequest(
  agent: OfficeAgent,
): Extract<FoundationOfficeHandoffRequest, { kind: "agent" }> {
  return {
    kind: "agent",
    key: agent.key,
    profileId: agent.hostKey,
    observedGeneration: agent.observedGeneration,
    terminalRef: agent.currentTerminalRef,
    currentPaneRef: agent.currentPaneRef,
  };
}

export function foundationOfficeRoomHandoffRequest(
  room: OfficeRoomRosterEntry,
): Extract<FoundationOfficeHandoffRequest, { kind: "room" }> {
  return {
    kind: "room",
    key: room.key,
    profileId: room.hostKey,
    observedGeneration: room.observedGeneration,
    workspaceRef: room.workspaceRef,
  };
}

/**
 * Perform the explicit cross-runtime handoff required by the public
 * Foundation contract: select the exact runtime, focus the qualified target,
 * then navigate to Spaces. Focus commands intentionally do not select a
 * runtime as a side effect.
 */
export async function handoffFoundationOfficeToSpaces(
  host: SurfaceHostV1,
  request: FoundationOfficeHandoffRequest,
  beforeNavigate: () => void = () => {},
) {
  const runtime = currentEnabledRuntime(host, request.profileId, request.observedGeneration);
  if (!runtime) {
    throw new Error("This host reconnected. Review the refreshed Office selection and try again.");
  }
  if (!hasSpacesAdmission(host, runtime)) {
    throw new Error("The full terminal is no longer available. Office remains open.");
  }

  const facts = host.facts.forRuntime(request.profileId);
  if (!facts || !sameRuntimeIdentity(facts.identity, runtime.identity)) {
    throw new Error("The selected host is no longer present.");
  }

  let target: SurfaceShellTarget;
  if (request.kind === "room") {
    assertQualifiedTarget(request.workspaceRef, request.profileId, "workspace");
    const workspace = facts.workspaces.find(({ workspaceId }) =>
      workspaceId === request.workspaceRef.nativeTargetId,
    );
    if (!workspace) {
      throw new Error("The selected workspace is no longer present.");
    }
    target = {
      identity: runtime.identity,
      kind: "workspace",
      nativeTargetId: workspace.workspaceId,
    };
  } else {
    assertQualifiedTarget(request.currentPaneRef, request.profileId, "pane");
    assertQualifiedTarget(request.terminalRef, request.profileId, "terminal");
    const pane = facts.panes.find(({ terminalId }) =>
      terminalId === request.terminalRef.nativeTargetId,
    ) ?? null;
    if (!pane) {
      throw new Error("The selected terminal is no longer present.");
    }
    target = {
      identity: runtime.identity,
      kind: "pane",
      nativeTargetId: pane.paneId,
    };
  }
  await handoffFoundationShellTargetToSpaces(host, target, beforeNavigate);
}

/**
 * Preserve the exact semantic target chosen in Foundation's shared switcher.
 * Validation completes before the required select -> focus -> navigate order.
 */
export async function handoffFoundationShellTargetToSpaces(
  host: SurfaceHostV1,
  target: SurfaceShellTarget,
  beforeNavigate: () => void = () => {},
) {
  const command = target.kind === "workspace"
    ? "focusWorkspace"
    : target.kind === "tab"
      ? "focusTab"
      : "focusPane";
  const runtime = host.runtimes.find(({ identity }) => sameRuntimeIdentity(identity, target.identity))
    ?? null;
  if (!runtime) {
    throw new Error("This host reconnected. Review the refreshed Office selection and try again.");
  }
  if (
    !hasSpacesAdmission(host, runtime) ||
    !runtime.commands.includes(command)
  ) {
    throw new Error("The full terminal is no longer available. Office remains open.");
  }
  const facts = host.facts.forRuntime(target.identity.bridgeId);
  if (!facts || !sameRuntimeIdentity(facts.identity, runtime.identity)) {
    throw new Error("The selected host is no longer present.");
  }

  if (target.kind === "workspace") {
    if (!facts.workspaces.some(({ workspaceId }) => workspaceId === target.nativeTargetId)) {
      throw new Error("The selected workspace is no longer present.");
    }
  } else if (target.kind === "tab") {
    if (!facts.tabs.some(({ tabId }) => tabId === target.nativeTargetId)) {
      throw new Error("The selected tab is no longer present.");
    }
  } else if (!facts.panes.some(({ paneId }) => paneId === target.nativeTargetId)) {
    throw new Error("The selected pane is no longer present.");
  }

  host.selectRuntime(runtime.identity);
  if (target.kind === "workspace") {
    await host.commands.dispatch({ type: "focusWorkspace", target });
  } else if (target.kind === "tab") {
    await host.commands.dispatch({ type: "focusTab", target });
  } else {
    await host.commands.dispatch({ type: "focusPane", target });
  }
  beforeNavigate();
  host.navigation.goTo("spaces");
}

function currentEnabledRuntime(
  host: SurfaceHostV1,
  bridgeId: string,
  generationKey: string,
): SurfaceRuntimeView | null {
  const runtime = host.runtimes.find(({ identity }) =>
    identity.bridgeId === bridgeId && identity.generationKey === generationKey,
  ) ?? null;
  return runtime;
}

function hasSpacesAdmission(host: SurfaceHostV1, runtime: SurfaceRuntimeView) {
  if (runtime.state !== "ready") return false;
  const admission = host.capabilities.admission(["snapshot", "terminal_attach"])
    .find(({ identity }) => sameRuntimeIdentity(identity, runtime.identity));
  return admission?.available === true;
}

function assertQualifiedTarget(
  target: QualifiedTarget,
  bridgeId: string,
  kind: "workspace" | "pane" | "terminal",
) {
  if (target.profileId !== bridgeId || target.kind !== kind || !target.nativeTargetId) {
    throw new Error(`The selected ${kind} is no longer present.`);
  }
}

function sameRuntimeIdentity(
  left: { bridgeId: string; connectionKey: string; generationKey: string },
  right: { bridgeId: string; connectionKey: string; generationKey: string },
) {
  return left.bridgeId === right.bridgeId &&
    left.connectionKey === right.connectionKey &&
    left.generationKey === right.generationKey;
}
