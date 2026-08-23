import { useSyncExternalStore } from "react";
import type { SurfaceHostV1, SurfaceRuntimeFacts, SurfaceRuntimeView } from "@herdr-world/foundation/surfaces";
import { useEffect, useState } from "react";
import type { AgentStatus, PaneInfo, Snapshot, TabInfo, WorkspaceInfo } from "../types";
import { hostProfile } from "../hostProfile";
import WorldSurface from "./WorldSurface";
import type { WorldSurfaceContext } from "./WorldSurface";
import { EMPTY_OFFICE_OBSERVABILITY } from "./officeObservability";
import { projectHerdrOffice } from "./herdrOfficeProjection";
import type { HerdrOfficeSourceHost } from "./herdrOfficeProjection";
import type { WorldFoundationHandoffRequest } from "./worldFoundationHandoff";
import { readWorldCompletionSeenKeys } from "./completionSeenState";

export type WorldOfficeStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => WorldSurfaceContext;
  dispose: () => void;
};

export function createWorldOfficeContext(host: SurfaceHostV1): WorldOfficeStore {
  const listeners = new Set<() => void>();
  let selectedKey: string | null = null;
  let handoffStatus: string | null = null;
  let disposed = false;
  let view = createView();
  const unsubscribeFacts = host.facts.subscribe(refresh);

  function createView(): WorldSurfaceContext {
    const sources = [...host.availableRuntimes]
      .sort((left, right) => left.label.localeCompare(right.label) || left.identity.bridgeId.localeCompare(right.identity.bridgeId))
      .map((runtime, displayOrder) => sourceForRuntime(host, runtime, displayOrder));
    return {
      projection: projectHerdrOffice(sources, Date.now()),
      observability: EMPTY_OFFICE_OBSERVABILITY,
      selectedKey,
      completionSeenKeys: readWorldCompletionSeenKeys(),
      onSelect: (key) => {
        selectedKey = key;
        refresh();
      },
      compact: false,
      onBackToSidebar: () => {},
      onToggleSidebar: () => {},
      onOpenInSpaces: (request: WorldFoundationHandoffRequest) => {
        void openInSpaces(request);
      },
      handoffStatus,
      conversationBubbles: [],
      onCloseConversation: () => {},
      onFocusConversation: () => {},
      agentActivityTransitions: new Map(),
      roomAlignment: "left",
      longRoomTitleMode: "expand",
      canCreateSeat: () => false,
      onNewSeat: () => {},
      canCreateRoom: () => false,
      onCreateRoom: () => {},
      canRenameRoom: () => false,
      onRenameRoom: () => {},
      canCloseRoom: () => false,
      onCloseRoom: () => {},
    };
  }

  function refresh() {
    if (disposed) return;
    view = createView();
    for (const listener of listeners) listener();
  }

  async function openInSpaces(request: WorldFoundationHandoffRequest) {
    const runtime = host.availableRuntimes.find(
      ({ identity }) => identity.bridgeId === request.profileId,
    );
    if (!runtime || runtime.state !== "ready") {
      handoffStatus = "This host is not currently available in Spaces.";
      refresh();
      return;
    }
    const nativeTargetId = request.kind === "agent"
      ? request.currentPaneRef.nativeTargetId
      : request.workspaceRef.nativeTargetId;
    const kind = request.kind === "agent" ? "pane" : "workspace";
    host.navigation.goTo("spaces");
    try {
      if (kind === "pane") {
        await host.commands.dispatch({
          type: "focusPane",
          target: { identity: runtime.identity, kind: "pane", nativeTargetId },
        });
      } else {
        await host.commands.dispatch({
          type: "focusWorkspace",
          target: { identity: runtime.identity, kind: "workspace", nativeTargetId },
        });
      }
      handoffStatus = null;
    } catch {
      handoffStatus = "The exact Spaces target became unavailable. Office remains open.";
    }
    refresh();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    dispose() {
      disposed = true;
      unsubscribeFacts();
      listeners.clear();
    },
  };
}

export function WorldFoundationSurface({ context }: { context: WorldOfficeStore }) {
  const snapshot = useSyncExternalStore(context.subscribe, context.getSnapshot, context.getSnapshot);
  const [compact, setCompact] = useState(() => globalThis.matchMedia?.("(max-width: 760px)").matches ?? false);

  useEffect(() => {
    const media = globalThis.matchMedia?.("(max-width: 760px)");
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return <WorldSurface context={{ ...snapshot, compact }} />;
}

function sourceForRuntime(
  host: SurfaceHostV1,
  runtime: SurfaceRuntimeView,
  displayOrder: number,
): HerdrOfficeSourceHost {
  const facts = host.facts.forRuntime(runtime.identity.bridgeId);
  const enabled = host.runtimes.some(({ identity }) => identity.bridgeId === runtime.identity.bridgeId);
  return {
    profile: hostProfile(
      runtime.identity.bridgeId,
      runtime.label,
      `foundation://bridge/${encodeURIComponent(runtime.identity.bridgeId)}`,
      enabled,
      displayOrder,
    ),
    location: "remote",
    connectionState: connectionState(runtime, facts),
    generationKey: facts ? runtime.identity.generationKey : null,
    features: runtime.features,
    snapshot: facts ? snapshotFromFacts(facts) : null,
  };
}

function connectionState(
  runtime: SurfaceRuntimeView,
  facts: SurfaceRuntimeFacts | null,
): HerdrOfficeSourceHost["connectionState"] {
  if (runtime.state === "disabled") return "disabled";
  if (runtime.state === "incompatible") return "incompatible";
  if (runtime.state === "offline") return "offline";
  if (runtime.state === "degraded") return facts ? "degraded" : "offline";
  if (runtime.state === "connecting") return "connecting";
  return facts ? "compatible" : "connecting";
}

function snapshotFromFacts(facts: SurfaceRuntimeFacts): Snapshot {
  return {
    workspaces: facts.workspaces.map((workspace): WorkspaceInfo => ({
      workspace_id: workspace.workspaceId,
      number: workspace.number,
      label: workspace.label,
      focused: workspace.focused,
      pane_count: workspace.paneCount,
      tab_count: workspace.tabCount,
      active_tab_id: workspace.activeTabId ?? "",
      agent_status: "unknown",
    })),
    tabs: facts.tabs.map((tab): TabInfo => ({
      tab_id: tab.tabId,
      workspace_id: tab.workspaceId,
      number: tab.number,
      label: tab.label,
      focused: tab.focused,
      pane_count: tab.paneCount,
      agent_status: "unknown",
    })),
    panes: facts.panes.map((pane): PaneInfo => {
      const agentStatus = officeAgentStatus(pane.agentStatus);
      return {
        pane_id: pane.paneId,
        terminal_id: pane.terminalId,
        workspace_id: pane.workspaceId,
        tab_id: pane.tabId,
        focused: pane.focused,
        label: pane.label ?? undefined,
        agent: pane.agent ?? undefined,
        display_agent: pane.displayAgent ?? undefined,
        task_summary: pane.taskSummary ?? undefined,
        agent_status: agentStatus,
        state_labels: pane.taskSummary ? { [agentStatus]: pane.taskSummary } : undefined,
        revision: 0,
      };
    }),
    layouts: [],
    selected_pane_id: facts.selection?.pane.nativeTargetId ?? null,
  };
}

function officeAgentStatus(value: string): AgentStatus {
  return value === "idle" || value === "working" || value === "blocked" || value === "done"
    ? value
    : "unknown";
}
