import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SurfaceHostV1,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import type { ManagedTerminalTarget } from "@herdr-world/foundation/terminal";
import { ConfirmDialog, RenameDialog } from "../overlays";
import { LaunchDialog } from "../LaunchDialog";
import { resolveLaunchSpec } from "../launch";
import type { LaunchSpec } from "../launch";
import type { LauncherPresetOption } from "../launcherPresets";
import { agentActivityKey } from "../agentActivity";
import { EMPTY_OFFICE_OBSERVABILITY } from "./officeObservability";
import type { OfficeAgent } from "./herdrOfficeProjection";
import { projectHerdrOffice } from "./herdrOfficeProjection";
import {
  handoffFoundationOfficeToSpaces,
  handoffFoundationShellTargetToSpaces,
} from "./foundationWorldHandoff";
import type { FoundationOfficeHandoffRequest } from "./foundationWorldHandoff";
import { FoundationWorldConversationBubble } from "./FoundationWorldConversationBubble";
import { foundationOfficeObservability, foundationPane, foundationRuntime, foundationWorldSources } from "./foundationWorldAdapter";
import WorldSurface from "./WorldSurface";
import type { WorldConversationBubblePanel, WorldSurfaceContext } from "./WorldSurface";
import {
  readWorldCompletionSeenKeys,
  writeWorldCompletionSeenKeys,
} from "./completionSeenState";
import {
  readWorldLayoutSettings,
} from "./worldSettingsState";
import {
  createFoundationWorldSettingsSyncState,
  synchronizeStoredFoundationWorldSettings,
} from "./foundationWorldSettingsSync";
import { officeDebug } from "../officeDebug";

const WORLD_CONVERSATIONS_STORAGE_KEY = "herdrWeb.worldConversations.v1";
const MAX_WORLD_CONVERSATIONS = 5;
const WORLD_SELECTION_DELAY_MS = 300;
const TOUCH_INPUT_QUERY = "(hover: none) and (pointer: coarse)";

type FoundationWorldContext = { host: SurfaceHostV1 };

type WorldConversationTarget = {
  windowId: string;
  kind: "agent" | "desk";
  targetKey: string;
  agentKey: string | null;
  bridgeId: string;
  paneId: string;
  generationKey: string;
};

type RoomDialogState =
  | { mode: "create"; runtime: SurfaceRuntimeView }
  | { mode: "rename"; roomKey: string; runtime: SurfaceRuntimeView; initial: string }
  | { mode: "close"; roomKey: string; runtime: SurfaceRuntimeView; label: string };

type LaunchState = {
  runtime: SurfaceRuntimeView;
  roomKey: string;
  workspaceId: string;
  options: LauncherPresetOption[];
};

type PendingLaunch = {
  bridgeId: string;
  generationKey: string;
  roomKey: string;
  paneId: string;
};

export function FoundationWorldSurface({ context }: { context: FoundationWorldContext }) {
  const { host } = context;
  const [factsRevision, setFactsRevision] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [completionSeenKeys, setCompletionSeenKeys] = useState(() => readWorldCompletionSeenKeys());
  const [observability, setObservability] = useState(EMPTY_OFFICE_OBSERVABILITY);
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);
  const [conversationTargets, setConversationTargets] = useState<WorldConversationTarget[]>(readConversationTargets);
  const [roomDialog, setRoomDialog] = useState<RoomDialogState | null>(null);
  const [launchState, setLaunchState] = useState<LaunchState | null>(null);
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState(readWorldLayoutSettings);
  const settingsSyncStateRef = useRef(createFoundationWorldSettingsSyncState());
  const selectionTimerRef = useRef<number | null>(null);
  const compact = host.shell.state.compact;
  const touchInput = useWorldTouchInput();

  const cancelPendingSelection = useCallback(() => {
    if (selectionTimerRef.current === null) return;
    window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = null;
  }, []);

  useEffect(() => cancelPendingSelection, [cancelPendingSelection]);

  useEffect(() => {
    const unsubscribeFacts = host.facts.subscribe(() => setFactsRevision((value) => value + 1));
    const unsubscribeRuntime = host.subscribeSelectedRuntime(() => setFactsRevision((value) => value + 1));
    const unsubscribeShell = host.shell.subscribe(() => setFactsRevision((value) => value + 1));
    const onLayoutSettings = () => setLayoutSettings(readWorldLayoutSettings());
    window.addEventListener("herdr-world-settings-updated", onLayoutSettings);
    return () => {
      unsubscribeFacts();
      unsubscribeRuntime();
      unsubscribeShell();
      window.removeEventListener("herdr-world-settings-updated", onLayoutSettings);
    };
  }, [host]);

  const sources = useMemo(() => foundationWorldSources(host), [factsRevision, host]);
  const projection = useMemo(
    () => projectHerdrOffice(sources, Date.now()),
    [sources],
  );
  const runtimeKey = JSON.stringify(host.runtimes.map((runtime) => ({
    identity: runtime.identity,
    state: runtime.state,
    observability: runtime.features.includes("observability_extension"),
  })));

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    const refresh = async () => {
      await synchronizeStoredFoundationWorldSettings(
        host,
        host.runtimes,
        settingsSyncStateRef.current,
      );
      if (disposed) return;
      void foundationOfficeObservability(host)
        .then((next) => {
          if (!disposed) setObservability(next);
        })
        .catch(() => {
          if (!disposed) setObservability(EMPTY_OFFICE_OBSERVABILITY);
        });
    };
    void refresh();
    timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [host, runtimeKey]);

  useEffect(() => {
    setConversationTargets((current) => current.flatMap((target) => {
      const runtime = foundationRuntime(host, target.bridgeId);
      if (!runtime) {
        officeDebug("conversation:restore-waiting", {
          bridgeId: target.bridgeId,
          paneId: target.paneId,
          reason: "runtime-unavailable",
        });
        return [target];
      }
      const facts = host.facts.forRuntime(target.bridgeId);
      if (!facts) {
        officeDebug("conversation:restore-waiting", {
          bridgeId: target.bridgeId,
          paneId: target.paneId,
          reason: "facts-unavailable",
          runtimeState: runtime.state,
          generationKey: runtime.identity.generationKey,
        });
        return [target];
      }
      if (runtime.state !== "ready") {
        officeDebug("conversation:restore-waiting", {
          bridgeId: target.bridgeId,
          paneId: target.paneId,
          reason: "runtime-not-ready",
          runtimeState: runtime.state,
          generationKey: runtime.identity.generationKey,
          factsGenerationKey: facts.identity.generationKey,
          paneCount: facts.panes.length,
        });
        return [target];
      }
      const pane = foundationPane(
        host,
        target.bridgeId,
        target.paneId,
        runtime.identity.generationKey,
      );
      if (!pane) {
        officeDebug("conversation:restore-removed", {
          bridgeId: target.bridgeId,
          paneId: target.paneId,
          runtimeState: runtime.state,
          generationKey: runtime.identity.generationKey,
          factsGenerationKey: facts.identity.generationKey,
          paneCount: facts.panes.length,
        });
        return [];
      }
      officeDebug("conversation:restore-admitted", {
        bridgeId: target.bridgeId,
        paneId: target.paneId,
        generationKey: runtime.identity.generationKey,
      });
      return [{
        ...target,
        generationKey: runtime.identity.generationKey,
      }];
    }));
  }, [factsRevision, host]);

  useEffect(() => {
    persistConversationTargets(conversationTargets);
  }, [conversationTargets]);

  const agentActivityTransitions = useMemo(() => {
    const transitions = new Map<string, number>();
    for (const source of sources) {
      for (const activity of source.facts?.activities ?? []) {
        transitions.set(
          agentActivityKey(source.runtime.identity.bridgeId, activity.paneId, activity.terminalId),
          activity.changedAt,
        );
      }
    }
    return transitions;
  }, [sources]);

  const markCompletion = useCallback((key: string) => {
    setCompletionSeenKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      writeWorldCompletionSeenKeys(next);
      return next;
    });
  }, []);

  const openConversation = useCallback((target: WorldConversationTarget) => {
    const existing = conversationTargets.some(({ windowId }) => windowId === target.windowId);
    if (!existing && !compact && conversationTargets.length >= MAX_WORLD_CONVERSATIONS) {
      setHandoffStatus("Five Office terminals are open. Close one before opening another.");
      return false;
    }
    setHandoffStatus(null);
    setConversationTargets((current) => {
      const index = current.findIndex(({ windowId }) => windowId === target.windowId);
      if (index < 0) return compact ? [target] : [...current, target];
      return current.map((item, currentIndex) => currentIndex === index ? target : item);
    });
    return true;
  }, [compact, conversationTargets]);

  useEffect(() => {
    if (!pendingLaunch) return;
    const runtime = foundationRuntime(host, pendingLaunch.bridgeId, pendingLaunch.generationKey);
    const currentRuntime = foundationRuntime(host, pendingLaunch.bridgeId);
    if (
      !runtime &&
      currentRuntime &&
      currentRuntime.identity.generationKey !== pendingLaunch.generationKey
    ) {
      setPendingLaunch(null);
      setHandoffStatus("The host reconnected before the new seat could be opened.");
      return;
    }
    const pane = foundationPane(
      host,
      pendingLaunch.bridgeId,
      pendingLaunch.paneId,
      pendingLaunch.generationKey,
    );
    if (!runtime || !pane) return;
    setPendingLaunch(null);
    openConversation({
      windowId: conversationWindowId(pendingLaunch.bridgeId, pane.paneId),
      kind: "desk",
      targetKey: pendingLaunch.roomKey,
      agentKey: null,
      bridgeId: pendingLaunch.bridgeId,
      paneId: pane.paneId,
      generationKey: runtime.identity.generationKey,
    });
  }, [factsRevision, host, openConversation, pendingLaunch]);

  const closeConversation = useCallback((windowId: string) => {
    setConversationTargets((current) => current.filter(({ windowId: id }) => id !== windowId));
  }, []);

  const selectAgent = useCallback((agent: OfficeAgent) => {
    setSelectedKey(agent.key);
    setHandoffStatus(null);
    const runtime = enabledExactRuntime(host, agent.hostKey, agent.observedGeneration);
    const pane = foundationPane(
      host,
      agent.hostKey,
      agent.currentPaneRef.nativeTargetId,
      agent.observedGeneration,
    );
    if (
      agent.stale ||
      runtime?.state !== "ready" ||
      !runtime.features.includes("terminal_attach") ||
      pane?.terminalId !== agent.currentTerminalRef.nativeTargetId ||
      !selectExactRuntime(host, agent.hostKey, agent.observedGeneration)
    ) return;
    if (agent.semanticStatus === "done") markCompletion(agent.key);
    openConversation({
      windowId: conversationWindowId(agent.hostKey, agent.currentPaneRef.nativeTargetId),
      kind: "agent",
      targetKey: agent.key,
      agentKey: agent.key,
      bridgeId: agent.hostKey,
      paneId: agent.currentPaneRef.nativeTargetId,
      generationKey: agent.observedGeneration,
    });
  }, [host, markCompletion, openConversation]);

  const selectDesk = useCallback((roomKey: string, tabId: string, hostKey: string, generationKey: string, agent: OfficeAgent | null, paneId: string | null) => {
    setSelectedKey(agent?.key ?? roomKey);
    setHandoffStatus(null);
    if (!paneId) return;
    const runtime = enabledExactRuntime(host, hostKey, generationKey);
    const pane = foundationPane(host, hostKey, paneId, generationKey);
    if (
      runtime?.state !== "ready" ||
      !runtime.features.includes("terminal_attach") ||
      !pane ||
      !selectExactRuntime(host, hostKey, generationKey)
    ) return;
    if (agent?.semanticStatus === "done") markCompletion(agent.key);
    openConversation({
      windowId: conversationWindowId(hostKey, pane.paneId),
      kind: "desk",
      targetKey: roomKey,
      agentKey: agent?.key ?? null,
      bridgeId: hostKey,
      paneId: pane.paneId,
      generationKey,
    });
  }, [host, markCompletion, openConversation]);

  const onSelect = useCallback((key: string | null) => {
    cancelPendingSelection();
    setHandoffStatus(null);
    if (!key) {
      setSelectedKey(null);
      setConversationTargets([]);
      return;
    }
    const agentEntry = projection.roster.find(({ agent }) => agent.key === key);
    if (agentEntry) {
      setSelectedKey(agentEntry.agent.key);
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null;
        selectAgent(agentEntry.agent);
      }, WORLD_SELECTION_DELAY_MS);
      return;
    }
    const deskEntry = projection.deskRoster.find(({ desk }) => desk.key === key);
    if (deskEntry) {
      const occupant = deskEntry.desk.occupantAgentKey
        ? projection.roster.find(({ agent }) => agent.key === deskEntry.desk.occupantAgentKey)?.agent ?? null
        : null;
      const source = sources.find(({ profile }) => profile.profileId === deskEntry.desk.hostKey);
      const panes = source?.snapshot?.panes.filter((pane) => pane.tab_id === deskEntry.desk.tabRef.nativeTargetId) ?? [];
      const pane = occupant
        ? panes.find(({ pane_id }) => pane_id === occupant.currentPaneRef.nativeTargetId) ?? null
        : panes.find(({ focused }) => focused) ?? panes[0] ?? null;
      setSelectedKey(occupant?.key ?? deskEntry.desk.roomKey);
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null;
        selectDesk(
          deskEntry.desk.roomKey,
          deskEntry.desk.tabRef.nativeTargetId,
          deskEntry.desk.hostKey,
          deskEntry.desk.observedGeneration,
          occupant,
          pane?.pane_id ?? null,
        );
      }, WORLD_SELECTION_DELAY_MS);
      return;
    }
    setSelectedKey(key);
  }, [cancelPendingSelection, projection, selectAgent, selectDesk, sources]);

  const openInSpaces = useCallback(async (request: FoundationOfficeHandoffRequest) => {
    cancelPendingSelection();
    try {
      await handoffFoundationOfficeToSpaces(host, request, () => {
        persistConversationTargets([]);
        setConversationTargets([]);
      });
      setHandoffStatus(null);
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "The selected host is unavailable.");
    }
  }, [cancelPendingSelection, host]);

  const openShellTargetInSpaces = useCallback(async (
    target: Parameters<typeof handoffFoundationShellTargetToSpaces>[1],
  ) => {
    cancelPendingSelection();
    try {
      await handoffFoundationShellTargetToSpaces(host, target, () => {
        persistConversationTargets([]);
        setConversationTargets([]);
      });
      setHandoffStatus(null);
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "The selected host is unavailable.");
    }
  }, [cancelPendingSelection, host]);

  useEffect(() => {
    return host.shell.subscribeInteractions((interaction) => {
      const { target } = interaction;
      const runtime = host.runtimes.find(({ identity }) =>
        identity.bridgeId === target.identity.bridgeId &&
        identity.connectionKey === target.identity.connectionKey &&
        identity.generationKey === target.identity.generationKey,
      );
      const facts = host.facts.forRuntime(target.identity.bridgeId);
      if (
        !runtime ||
        !facts ||
        facts.identity.connectionKey !== target.identity.connectionKey ||
        facts.identity.generationKey !== target.identity.generationKey
      ) return;
      if (interaction.type === "activate") {
        void openShellTargetInSpaces(target);
        return;
      }
      if (target.kind === "workspace") {
        const room = projection.roomRoster.find((candidate) =>
          candidate.hostKey === target.identity.bridgeId &&
          candidate.observedGeneration === target.identity.generationKey &&
          candidate.workspaceRef.nativeTargetId === target.nativeTargetId,
        ) ?? null;
        if (room && selectExactRuntime(host, room.hostKey, room.observedGeneration)) {
          setHandoffStatus(null);
          setSelectedKey(room.key);
        }
        return;
      }
      const pane = target.kind === "pane"
        ? facts.panes.find(({ paneId }) => paneId === target.nativeTargetId) ?? null
        : null;
      const tabId = target.kind === "tab" ? target.nativeTargetId : pane?.tabId ?? null;
      if (!tabId) return;
      const agent = pane
        ? projection.roster.find(({ agent: candidate }) =>
            candidate.hostKey === target.identity.bridgeId &&
            candidate.observedGeneration === target.identity.generationKey &&
            candidate.currentPaneRef.nativeTargetId === pane.paneId,
          )?.agent ?? null
        : null;
      const desk = projection.deskRoster.find(({ desk: candidate }) =>
        candidate.hostKey === target.identity.bridgeId &&
        candidate.observedGeneration === target.identity.generationKey &&
        candidate.tabRef.nativeTargetId === tabId,
      )?.desk ?? null;

      if (agent) {
        selectAgent(agent);
        return;
      }
      if (!desk) return;
      const occupant = desk.occupantAgentKey
        ? projection.roster.find(({ agent: candidate }) => candidate.key === desk.occupantAgentKey)?.agent ?? null
        : null;
      const selectedPane = pane ?? facts.panes.find(({ paneId }) =>
        paneId === occupant?.currentPaneRef.nativeTargetId,
      ) ?? facts.panes.find((candidate) => candidate.tabId === tabId && candidate.focused)
        ?? facts.panes.find((candidate) => candidate.tabId === tabId)
        ?? null;
      selectDesk(
        desk.roomKey,
        tabId,
        desk.hostKey,
        desk.observedGeneration,
        occupant,
        selectedPane?.paneId ?? null,
      );
    });
  }, [host, openShellTargetInSpaces, projection, selectAgent, selectDesk]);

  const currentRuntimeForRoom = useCallback((roomKey?: string) => {
    const room = roomKey ? projection.rooms.find(({ key }) => key === roomKey) : null;
    return foundationRuntime(
      host,
      room?.hostKey ?? host.selectedRuntime?.identity.bridgeId ?? host.runtimes[0]?.identity.bridgeId ?? "",
      room?.observedGeneration,
    );
  }, [host, projection.rooms]);

  const canCreateRoom = useCallback((roomKey?: string) => {
    const runtime = currentRuntimeForRoom(roomKey);
    return Boolean(runtime?.state === "ready" && runtime.commands.includes("createWorkspace"));
  }, [currentRuntimeForRoom]);

  const canManageRoom = useCallback((roomKey: string, command: "renameWorkspace" | "closeWorkspace") => {
    const room = projection.rooms.find(({ key }) => key === roomKey);
    const runtime = room ? foundationRuntime(host, room.hostKey, room.observedGeneration) : null;
    return Boolean(runtime?.state === "ready" && runtime.commands.includes(command));
  }, [host, projection.rooms]);

  const canCreateSeat = useCallback((roomKey: string) => {
    const room = projection.rooms.find(({ key }) => key === roomKey);
    const runtime = room ? foundationRuntime(host, room.hostKey, room.observedGeneration) : null;
    return Boolean(runtime?.state === "ready" && runtime.launcherPresets && runtime.commands.includes("createTab"));
  }, [host, projection.rooms]);

  const openCreateRoom = useCallback((roomKey?: string) => {
    const runtime = currentRuntimeForRoom(roomKey);
    if (runtime) setRoomDialog({ mode: "create", runtime });
  }, [currentRuntimeForRoom]);

  const openRenameRoom = useCallback((roomKey: string) => {
    const room = projection.rooms.find(({ key }) => key === roomKey);
    const runtime = room ? foundationRuntime(host, room.hostKey, room.observedGeneration) : null;
    if (room && runtime && canManageRoom(roomKey, "renameWorkspace")) {
      setRoomDialog({ mode: "rename", roomKey, runtime, initial: room.displayLabel });
    }
  }, [canManageRoom, host, projection.rooms]);

  const openCloseRoom = useCallback((roomKey: string) => {
    const room = projection.rooms.find(({ key }) => key === roomKey);
    const runtime = room ? foundationRuntime(host, room.hostKey, room.observedGeneration) : null;
    if (room && runtime && canManageRoom(roomKey, "closeWorkspace")) {
      setRoomDialog({ mode: "close", roomKey, runtime, label: room.displayLabel });
    }
  }, [canManageRoom, host, projection.rooms]);

  const submitRoomRename = async (label: string) => {
    if (!roomDialog) return;
    setRoomBusy(true);
    try {
      if (roomDialog.mode === "create") {
        await host.commands.dispatch({ type: "createWorkspace", runtime: roomDialog.runtime.identity, params: { label } });
      } else if (roomDialog.mode === "rename") {
        const room = projection.rooms.find(({ key }) => key === roomDialog.roomKey);
        if (!room) throw new Error("Room is no longer present.");
        await host.commands.dispatch({
          type: "renameWorkspace",
          target: { identity: roomDialog.runtime.identity, kind: "workspace", nativeTargetId: room.workspaceRef.nativeTargetId },
          params: { label },
        });
      }
      setRoomDialog(null);
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "Room update failed.");
    } finally {
      setRoomBusy(false);
    }
  };

  const confirmCloseRoom = async () => {
    if (!roomDialog || roomDialog.mode !== "close") return;
    const room = projection.rooms.find(({ key }) => key === roomDialog.roomKey);
    if (!room) {
      setRoomDialog(null);
      return;
    }
    setRoomBusy(true);
    try {
      await host.commands.dispatch({
        type: "closeWorkspace",
        target: { identity: roomDialog.runtime.identity, kind: "workspace", nativeTargetId: room.workspaceRef.nativeTargetId },
      });
      setRoomDialog(null);
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "Room close failed.");
    } finally {
      setRoomBusy(false);
    }
  };

  const openSeatLaunch = async (roomKey?: string) => {
    const room = roomKey ? projection.rooms.find(({ key }) => key === roomKey) : null;
    const runtime = room
      ? foundationRuntime(host, room.hostKey, room.observedGeneration)
      : currentRuntimeForRoom();
    if (!runtime || !room || !canCreateSeat(room.key)) {
      setHandoffStatus("New seats are unavailable on this host.");
      return;
    }
    try {
      const listed = await host.launchers.list(runtime.identity);
      setLaunchState({
        runtime,
        roomKey: room.key,
        workspaceId: room.workspaceRef.nativeTargetId,
        options: listed.presets.map((preset) => ({
          id: preset.id,
          label: preset.label,
          agent_hint: preset.agentHint,
          built_in: preset.builtIn,
        })),
      });
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "Could not load seat launchers.");
    }
  };

  const submitSeatLaunch = async (spec: LaunchSpec) => {
    if (!launchState) return;
    setLaunchBusy(true);
    try {
      const source = sources.find(({ profile }) => profile.profileId === launchState.runtime.identity.bridgeId);
      const next = resolveLaunchSpec(spec, source?.snapshot?.panes ?? []);
      const result = await host.launchers.launchTab({
        runtime: launchState.runtime.identity,
        workspace: {
          identity: launchState.runtime.identity,
          kind: "workspace",
          nativeTargetId: launchState.workspaceId,
        },
        presetId: next.presetId,
        title: next.title,
      });
      setPendingLaunch({
        bridgeId: result.runtime.bridgeId,
        generationKey: result.runtime.generationKey,
        roomKey: launchState.roomKey,
        paneId: result.pane.nativeTargetId,
      });
      setLaunchState(null);
      setHandoffStatus("New seat created. Opening terminal…");
    } catch (error) {
      setHandoffStatus(error instanceof Error ? error.message : "Seat launch failed.");
    } finally {
      setLaunchBusy(false);
    }
  };

  const conversationPanels = useMemo<WorldConversationBubblePanel[]>(() =>
    conversationTargets.flatMap((conversation) => {
      const runtime = foundationRuntime(host, conversation.bridgeId, conversation.generationKey);
      const pane = foundationPane(host, conversation.bridgeId, conversation.paneId, conversation.generationKey);
      if (!runtime || !pane) return [];
      const agent = conversation.agentKey
        ? projection.roster.find(({ agent: item }) => item.key === conversation.agentKey)?.agent ?? null
        : null;
      const target: ManagedTerminalTarget = {
        runtime: runtime.identity,
        paneId: pane.paneId,
        terminalId: pane.terminalId,
      };
      return [{
        id: conversation.windowId,
        targetKey: conversation.targetKey,
        selectedKey: agent?.key ?? null,
        content: (
          <FoundationWorldConversationBubble
            key={`${conversation.windowId}:${runtime.identity.generationKey}`}
            agent={agent}
            targetLabel={agent?.displayLabel ?? pane.label ?? "Terminal"}
            hostLabel={runtime.label}
            target={target}
            onClose={() => closeConversation(conversation.windowId)}
            onOpenInSpaces={() => void openShellTargetInSpaces({
              identity: runtime.identity,
              kind: "pane",
              nativeTargetId: pane.paneId,
            })}
            touchInput={touchInput}
            agentActivityTransitions={agentActivityTransitions}
          />
        ),
      }];
    }),
  [agentActivityTransitions, closeConversation, conversationTargets, factsRevision, host, openShellTargetInSpaces, projection, touchInput]);

  const surfaceContext: WorldSurfaceContext = {
    projection,
    observability,
    selectedKey,
    completionSeenKeys,
    onSelect,
    compact,
    onBackToSidebar: () => host.shell.showSidebar(),
    onToggleSidebar: () => host.shell.toggleSidebar(),
    onOpenInSpaces: (request) => void openInSpaces(request),
    handoffStatus,
    conversationBubbles: conversationPanels,
    onCloseConversation: closeConversation,
    onFocusConversation: (id) => {
      const target = conversationTargets.find(({ windowId }) => windowId === id);
      if (target) setSelectedKey(target.agentKey ?? target.targetKey);
    },
    agentActivityTransitions,
    roomAlignment: layoutSettings.roomAlignment,
    longRoomTitleMode: layoutSettings.longRoomTitleMode,
    canCreateSeat,
    onNewSeat: (roomKey) => void openSeatLaunch(roomKey),
    canCreateRoom,
    onCreateRoom: openCreateRoom,
    canRenameRoom: (roomKey) => canManageRoom(roomKey, "renameWorkspace"),
    onRenameRoom: openRenameRoom,
    canCloseRoom: (roomKey) => canManageRoom(roomKey, "closeWorkspace"),
    onCloseRoom: openCloseRoom,
  };

  return (
    <>
      <WorldSurface context={surfaceContext} />
      {roomDialog?.mode === "create" ? (
        <RenameDialog
          title="Create room"
          initial=""
          placeholder="Room name"
          busy={roomBusy}
          onCancel={() => setRoomDialog(null)}
          onSubmit={(label) => void submitRoomRename(label)}
        />
      ) : null}
      {roomDialog?.mode === "rename" ? (
        <RenameDialog
          title="Rename room"
          initial={roomDialog.initial}
          placeholder={roomDialog.initial}
          busy={roomBusy}
          onCancel={() => setRoomDialog(null)}
          onSubmit={(label) => void submitRoomRename(label)}
        />
      ) : null}
      {roomDialog?.mode === "close" ? (
        <ConfirmDialog
          title="Close room?"
          message="This closes the Herdr workspace and every desk, tab, and pane inside it."
          confirmLabel="Close room"
          busy={roomBusy}
          onCancel={() => setRoomDialog(null)}
          onConfirm={() => void confirmCloseRoom()}
        />
      ) : null}
      {launchState ? (
        <LaunchDialog
          target={{ mode: "tab", workspaceId: launchState.workspaceId }}
          busy={launchBusy}
          options={launchState.options}
          emptyMessage="No launcher presets available."
          onCancel={() => setLaunchState(null)}
          onSubmit={(spec) => void submitSeatLaunch(spec)}
        />
      ) : null}
    </>
  );
}

function selectExactRuntime(host: SurfaceHostV1, bridgeId: string, generationKey: string) {
  const runtime = enabledExactRuntime(host, bridgeId, generationKey);
  if (!runtime) return false;
  try {
    host.selectRuntime(runtime.identity);
    return true;
  } catch {
    return false;
  }
}

function enabledExactRuntime(host: SurfaceHostV1, bridgeId: string, generationKey: string) {
  return host.runtimes.find(({ identity }) =>
    identity.bridgeId === bridgeId && identity.generationKey === generationKey,
  ) ?? null;
}

function conversationWindowId(bridgeId: string, paneId: string) {
  return `${bridgeId}:${paneId}`;
}

function persistConversationTargets(targets: readonly WorldConversationTarget[]) {
  try {
    globalThis.sessionStorage?.setItem(
      WORLD_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(targets.map((target) => ({
        kind: target.kind,
        targetKey: target.targetKey,
        agentKey: target.agentKey,
        bridgeId: target.bridgeId,
        paneId: target.paneId,
        generationKey: target.generationKey,
      }))),
    );
  } catch {
    // Session storage can be unavailable in locked-down browser contexts.
  }
}

function readConversationTargets(): WorldConversationTarget[] {
  try {
    const raw = globalThis.sessionStorage?.getItem(WORLD_CONVERSATIONS_STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const record = candidate as Record<string, unknown>;
      if (
        (record.kind !== "agent" && record.kind !== "desk") ||
        typeof record.targetKey !== "string" ||
        typeof record.bridgeId !== "string" ||
        typeof record.paneId !== "string" ||
        typeof record.generationKey !== "string" ||
        (record.agentKey !== null && typeof record.agentKey !== "string")
      ) return [];
      return [{
        windowId: conversationWindowId(record.bridgeId, record.paneId),
        kind: record.kind,
        targetKey: record.targetKey,
        agentKey: record.agentKey as string | null,
        bridgeId: record.bridgeId,
        paneId: record.paneId,
        generationKey: record.generationKey,
      } satisfies WorldConversationTarget];
    }).slice(0, MAX_WORLD_CONVERSATIONS);
  } catch {
    return [];
  }
}

function useWorldTouchInput() {
  const [touchInput, setTouchInput] = useState(isWorldTouchInput);
  useEffect(() => {
    const media = window.matchMedia?.(TOUCH_INPUT_QUERY);
    const update = () => setTouchInput(isWorldTouchInput());
    update();
    media?.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return touchInput;
}

function isWorldTouchInput() {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.(TOUCH_INPUT_QUERY).matches) ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
}
