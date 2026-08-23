import { useSyncExternalStore } from "react";
import type { SurfaceHostV1, SurfaceRuntimeFacts, SurfaceRuntimeView } from "@herdr-world/foundation/surfaces";
import { useEffect, useState } from "react";
import type { AgentStatus, PaneInfo, Snapshot, TabInfo, WorkspaceInfo } from "../types";
import { hostProfile } from "../hostProfile";
import WorldSurface from "./WorldSurface";
import type { WorldCommandDialog, WorldSurfaceContext } from "./WorldSurface";
import { projectHerdrOffice } from "./herdrOfficeProjection";
import type { HerdrOfficeSourceHost } from "./herdrOfficeProjection";
import type { WorldFoundationHandoffRequest } from "./worldFoundationHandoff";
import {
  readWorldCompletionSeenKeys,
  writeWorldCompletionSeenKeys,
} from "./completionSeenState";
import { readWorldLongRoomTitleMode, readWorldRoomAlignment } from "./worldSettings";
import { agentActivityKey } from "../agentActivity";
import { WorldFoundationConversation } from "./worldFoundationConversation";

export type WorldOfficeStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => WorldSurfaceContext;
  dispose: () => void;
};

export function createWorldOfficeContext(host: SurfaceHostV1): WorldOfficeStore {
  const listeners = new Set<() => void>();
  const openConversationKeys = new Set(readOpenConversationKeys());
  let selectedKey: string | null = null;
  let handoffStatus: string | null = null;
  let commandDialog: WorldCommandDialog | null = null;
  let disposed = false;
  let view = createView();
  const unsubscribeFacts = host.facts.subscribe(refresh);
  const settingsChanged = () => refresh();
  globalThis.addEventListener?.("herdr-world-settings-changed", settingsChanged);

  function createView(): WorldSurfaceContext {
    const sources = host.availableRuntimes
      .map((runtime, displayOrder) => sourceForRuntime(host, runtime, displayOrder));
    const projection = projectHerdrOffice(sources, Date.now());
    const activityTransitions = new Map<string, number>();
    for (const runtime of host.availableRuntimes) {
      const facts = host.facts.forRuntime(runtime.identity.bridgeId);
      for (const activity of facts?.activities ?? []) {
        activityTransitions.set(
          agentActivityKey(runtime.identity.bridgeId, activity.paneId, activity.terminalId),
          activity.changedAt,
        );
      }
    }
    const conversationBubbles = [...openConversationKeys].flatMap((key) => {
      const entry = projection.roster.find(({ agent }) => agent.key === key);
      if (!entry) return [];
      const runtime = host.availableRuntimes.find(({ identity }) => identity.bridgeId === entry.agent.hostKey);
      const facts = runtime ? host.facts.forRuntime(runtime.identity.bridgeId) : null;
      if (!runtime || !facts || !isWorldRuntimeUsable(runtime)) return [];
      return [{
        id: key,
        targetKey: key,
        selectedKey: key,
        content: (
          <WorldFoundationConversation
            key={`${key}:${runtime.identity.generationKey}`}
            host={host}
            agent={entry.agent}
            runtime={runtime}
            onClose={() => {
              openConversationKeys.delete(key);
              writeOpenConversationKeys(openConversationKeys);
              refresh();
            }}
            onOpenInSpaces={() => {
              host.navigation.goTo("spaces");
              void host.commands.dispatch({
                type: "focusPane",
                target: {
                  identity: runtime.identity,
                  kind: "pane",
                  nativeTargetId: entry.agent.currentPaneRef.nativeTargetId,
                },
              });
            }}
            activityAt={activityTransitions.get(agentActivityKey(
              entry.agent.hostKey,
              entry.agent.currentPaneRef.nativeTargetId,
              entry.agent.currentTerminalRef.nativeTargetId,
            )) ?? null}
          />
        ),
      }];
    });
    return {
      projection,
      observability: observabilityFromSources(sources),
      selectedKey,
      completionSeenKeys: readWorldCompletionSeenKeys(),
      onSelect: (key) => {
        selectedKey = key;
        refresh();
      },
      onOpenConversation: (key) => {
        const entry = projection.roster.find(({ agent }) => agent.key === key);
        const runtime = entry && host.availableRuntimes.find(({ identity }) => identity.bridgeId === entry.agent.hostKey);
        if (!entry || !runtime || !isWorldRuntimeUsable(runtime)) return;
        if (entry.agent.semanticStatus === "done") {
          const completionSeenKeys = readWorldCompletionSeenKeys();
          if (!completionSeenKeys.has(key)) {
            completionSeenKeys.add(key);
            writeWorldCompletionSeenKeys(completionSeenKeys);
          }
        }
        selectedKey = key;
        if (openConversationKeys.has(key) || openConversationKeys.size < 5) {
          openConversationKeys.add(key);
          writeOpenConversationKeys(openConversationKeys);
        }
        refresh();
      },
      compact: false,
      onBackToSidebar: () => host.navigation.goTo("spaces"),
      onToggleSidebar: () => host.navigation.goTo("spaces"),
      onOpenInSpaces: (request: WorldFoundationHandoffRequest) => {
        void openInSpaces(request);
      },
      handoffStatus,
      conversationBubbles,
      onCloseConversation: (id) => {
        openConversationKeys.delete(id);
        writeOpenConversationKeys(openConversationKeys);
        refresh();
      },
      onFocusConversation: () => {},
      agentActivityTransitions: activityTransitions,
      roomAlignment: readWorldRoomAlignment(),
      longRoomTitleMode: readWorldLongRoomTitleMode(),
      canCreateSeat: (roomKey) => supportsWorldCommand(projection, host, roomKey, "tab.create"),
      onNewSeat: (roomKey) => openCommandDialog(projection, roomKey, "newSeat"),
      canCreateRoom: (roomKey) => supportsWorldCommand(projection, host, roomKey, "workspace.create"),
      onCreateRoom: (roomKey) => openCommandDialog(projection, roomKey, "createRoom"),
      canRenameRoom: (roomKey) => supportsWorldCommand(projection, host, roomKey, "workspace.rename"),
      onRenameRoom: (roomKey) => openCommandDialog(projection, roomKey, "renameRoom"),
      canCloseRoom: (roomKey) => supportsWorldCommand(projection, host, roomKey, "workspace.close"),
      onCloseRoom: (roomKey) => openCommandDialog(projection, roomKey, "closeRoom"),
      commandDialog,
      onCancelCommandDialog: () => {
        commandDialog = null;
        refresh();
      },
      onSubmitCommandDialog: (value) => {
        const dialog = commandDialog;
        commandDialog = null;
        refresh();
        if (dialog) void submitCommandDialog(projection, host, dialog, value);
      },
    };
  }

  function openCommandDialog(
    projection: WorldSurfaceContext["projection"],
    roomKey: string | undefined,
    kind: WorldCommandDialog["kind"],
  ) {
    const room = roomKey ? projection.rooms.find(({ key }) => key === roomKey) : projection.rooms[0];
    commandDialog = {
      kind,
      roomKey: room?.key,
      roomLabel: room?.accessibleLabel ?? room?.displayLabel,
    };
    refresh();
  }

  async function submitCommandDialog(
    projection: WorldSurfaceContext["projection"],
    surfaceHost: SurfaceHostV1,
    dialog: WorldCommandDialog,
    value: string,
  ) {
    try {
      if (dialog.kind === "newSeat") {
        await dispatchWorldCommand(projection, surfaceHost, dialog.roomKey, {
          type: "launchPresetTab",
          presetId: "shell",
          title: "Shell",
        });
      } else if (dialog.kind === "createRoom") {
        await dispatchWorldCommand(projection, surfaceHost, dialog.roomKey, {
          type: "createWorkspace",
          label: value.trim() || "New room",
        });
      } else if (dialog.kind === "renameRoom") {
        await dispatchWorldCommand(projection, surfaceHost, dialog.roomKey, {
          type: "renameWorkspace",
          label: value.trim() || null,
        });
      } else {
        await dispatchWorldCommand(projection, surfaceHost, dialog.roomKey, {
          type: "closeWorkspace",
        });
      }
      handoffStatus = null;
    } catch {
      handoffStatus = "The requested Office action could not be completed.";
    }
    refresh();
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
    const target = request.kind === "agent"
      ? view.projection.roster.find(({ agent }) => agent.key === request.key)?.agent
      : view.projection.roomRoster.find(({ key }) => key === request.key);
    const targetIsStale = !target || target.stale;
    if (!runtime || !isWorldRuntimeUsable(runtime) || targetIsStale) {
      handoffStatus = "This host is not currently available in Spaces.";
      refresh();
      return;
    }
    const nativeTargetId = request.kind === "agent"
      ? request.currentPaneRef.nativeTargetId
      : request.workspaceRef.nativeTargetId;
    const kind = request.kind === "agent" ? "pane" : "workspace";
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
      host.navigation.goTo("spaces");
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
      globalThis.removeEventListener?.("herdr-world-settings-changed", settingsChanged);
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
  const worldCompatible = runtime.features.includes("snapshot") && runtime.commands.includes("focusWorkspace");
  const facts = worldCompatible ? host.facts.forRuntime(runtime.identity.bridgeId) : null;
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
    connectionState: worldCompatible ? connectionState(runtime, facts) : "incompatible",
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
        state_labels: { [agentStatus]: pane.taskSummary ?? officeStateLabel(agentStatus) },
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

function officeStateLabel(status: AgentStatus): string {
  switch (status) {
    case "done": return "Ready for review";
    case "blocked": return "Needs input";
    case "idle": return "Taking a break";
    case "working": return "Running";
    default: return "Unknown";
  }
}

function isWorldRuntimeUsable(runtime: SurfaceRuntimeView): boolean {
  // A degraded runtime may still expose its last snapshot, but it cannot
  // safely accept mutations or a new terminal attachment. Keep Office
  // read-only until Foundation has re-admitted the runtime as ready.
  return runtime.state === "ready";
}

const OPEN_CONVERSATIONS_STORAGE_KEY = "herdr-world.open-conversations.v1";

function readOpenConversationKeys(): string[] {
  try {
    const value = globalThis.sessionStorage?.getItem(OPEN_CONVERSATIONS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")
      ? parsed.slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function writeOpenConversationKeys(keys: ReadonlySet<string>): void {
  try {
    globalThis.sessionStorage?.setItem(
      OPEN_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify([...keys].slice(0, 5)),
    );
  } catch {
    // Session storage is optional; the in-memory conversation remains authoritative.
  }
}

function supportsWorldCommand(
  projection: WorldSurfaceContext["projection"],
  host: SurfaceHostV1,
  roomKey: string | undefined,
  command: string,
): boolean {
  const room = roomKey ? projection.rooms.find(({ key }) => key === roomKey) : projection.rooms[0];
  const runtime = room && host.availableRuntimes.find(({ identity }) => identity.bridgeId === room.hostKey);
  return Boolean(runtime && isWorldRuntimeUsable(runtime) && runtime.commands.includes(surfaceCommandCapability(command)));
}

function surfaceCommandCapability(command: string): "createWorkspace" | "renameWorkspace" | "closeWorkspace" | "launchPresetTab" {
  switch (command) {
    case "workspace.create": return "createWorkspace";
    case "workspace.rename": return "renameWorkspace";
    case "workspace.close": return "closeWorkspace";
    case "tab.create": return "launchPresetTab";
    default: throw new Error(`Unsupported World command: ${command}`);
  }
}

function observabilityFromSources(sources: readonly HerdrOfficeSourceHost[]) {
  const observedSources = sources.filter(({ snapshot }) => snapshot !== null);
  const activePaneCount = observedSources.reduce(
    (total, { snapshot }) => total + (snapshot?.panes.length ?? 0),
    0,
  );
  return {
    health: observedSources.length > 0 ? "available" as const : "unavailable" as const,
    providerId: observedSources.length > 0 ? "herdr-surface-facts" : null,
    sourceCount: sources.length,
    configuredSourceCount: observedSources.length,
    failedSourceCount: sources.filter(({ connectionState }) => connectionState === "offline").length,
    observedAt: Date.now(),
    windowSeconds: null,
    models: observedSources.length > 0
      ? [{
          provider: "herdr",
          model: "surface-activity",
          usage: { active_panes: activePaneCount },
          costUsd: null,
          costKind: null,
        }]
      : [],
    totalCostUsd: null,
    totalUsage: activePaneCount,
  };
}

async function dispatchWorldCommand(
  projection: WorldSurfaceContext["projection"],
  host: SurfaceHostV1,
  roomKey: string | undefined,
  command:
    | { type: "launchPresetTab"; presetId: string; title: string }
    | { type: "createWorkspace"; label: string }
    | { type: "renameWorkspace"; label: string | null }
    | { type: "closeWorkspace" },
) {
  const room = roomKey ? projection.rooms.find(({ key }) => key === roomKey) : projection.rooms[0];
  const runtime = room && host.availableRuntimes.find(({ identity }) => identity.bridgeId === room.hostKey);
  if (!room || !runtime || !isWorldRuntimeUsable(runtime)) {
    throw new Error("World command target is unavailable");
  }
  const target = {
    identity: runtime.identity,
    kind: "workspace" as const,
    nativeTargetId: room.workspaceRef.nativeTargetId,
  };
  try {
    await host.commands.dispatch({ ...command, target } as Parameters<SurfaceHostV1["commands"]["dispatch"]>[0]);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
