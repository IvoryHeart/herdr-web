import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  ExternalLink,
  PanelLeft,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SurfaceComponentProps } from "../surfaceRegistry";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
import type {
  OfficeConversationAnchors,
  OfficeConversationAnchorTarget,
} from "./PixelOfficeCanvas";
import {
  clampConversationGeometry,
  defaultConversationGeometry,
  moveConversationGeometry,
  resizeConversationGeometry,
} from "./conversationGeometry";
import type { ConversationGeometry } from "./conversationGeometry";
import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import { OFFICE_PRESENTATION_BOUNDS } from "./herdrOfficeProjection";
import type { OfficeObservability } from "./officeObservability";
import {
  officeAgentHandoffRequest,
  officeRoomHandoffRequest,
} from "./herdrOfficeHandoff";
import type { OfficeHandoffRequest } from "./herdrOfficeHandoff";
import { agentActivityKey } from "../agentActivity";
import {
  findOfficeSelection,
  formatOfficeActivityAge,
} from "./officeSelection";
import type { OfficeSelection } from "./officeSelection";

export type WorldSurfaceContext = {
  projection: HerdrOfficeProjection;
  observability: OfficeObservability;
  selectedKey: string | null;
  completionSeenKeys: ReadonlySet<string>;
  onSelect: (key: string | null) => void;
  compact: boolean;
  onBackToSidebar: () => void;
  onToggleSidebar: () => void;
  onOpenInSpaces: (request: OfficeHandoffRequest) => void;
  handoffStatus: string | null;
  conversationBubbles: readonly WorldConversationBubblePanel[];
  onCloseConversation: (id: string) => void;
  onFocusConversation: (id: string) => void;
  agentActivityTransitions: ReadonlyMap<string, number>;
  newSeatSupported: boolean;
  onNewSeat: () => void;
};

export type WorldConversationBubblePanel = {
  id: string;
  targetKey: string;
  selectedKey: string | null;
  content: ReactNode;
};

const FALLBACK_CONTEXT: WorldSurfaceContext = {
  projection: {
    version: 1,
    generatedAt: 0,
    hosts: [],
    rooms: [],
    receptions: [],
    barAgents: [],
    roomRoster: [],
    deskRoster: [],
    roster: [],
    unresolved: [],
    coverage: {
      configuredHosts: 0,
      observedHosts: 0,
      compatibleHosts: 0,
      connectingHosts: 0,
      staleHosts: 0,
      incompatibleHosts: 0,
      disabledHosts: 0,
      observedWorkspaces: 0,
      observedDesks: 0,
      observedAgents: 0,
      status: { working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 },
      omittedRooms: 0,
      omittedDesks: 0,
      omittedRoomAgents: 0,
      omittedReceptionDesks: 0,
      omittedWaitingAgents: 0,
      omittedBarAgents: 0,
    },
    presentationBounds: {
      ...OFFICE_PRESENTATION_BOUNDS,
      totalRooms: 0,
      renderedRooms: 0,
      totalDesks: 0,
      renderedDesks: 0,
      totalRoomAgents: 0,
      renderedRoomAgents: 0,
      totalReceptionDesks: 0,
      renderedReceptionDesks: 0,
      totalWaitingAgents: 0,
      renderedWaitingAgents: 0,
      totalBarAgents: 0,
      renderedBarAgents: 0,
    },
  },
  selectedKey: null,
  observability: {
    health: "unavailable",
    observedAt: 0,
    windowSeconds: null,
    models: [],
    totalCostUsd: null,
    totalUsage: 0,
  },
  completionSeenKeys: new Set(),
  onSelect: () => {},
  compact: false,
  onBackToSidebar: () => {},
  onToggleSidebar: () => {},
  onOpenInSpaces: () => {},
  handoffStatus: null,
  conversationBubbles: [],
  onCloseConversation: () => {},
  onFocusConversation: () => {},
  agentActivityTransitions: new Map(),
  newSeatSupported: false,
  onNewSeat: () => {},
};

export default function WorldSurface({ context }: SurfaceComponentProps) {
  const worldContext = isWorldSurfaceContext(context) ? context : FALLBACK_CONTEXT;
  const onActivateAgent = (key: string) => {
    const agent = worldContext.projection.roster.find(
      (entry) => entry.agent.key === key,
    )?.agent;
    if (!agent) {
      return;
    }
    worldContext.onSelect(key);
    worldContext.onOpenInSpaces(officeAgentHandoffRequest(agent));
  };
  const onActivateRoom = (key: string) => {
    const room = worldContext.projection.roomRoster.find((entry) => entry.key === key);
    if (!room) {
      return;
    }
    worldContext.onSelect(key);
    worldContext.onOpenInSpaces(officeRoomHandoffRequest(room));
  };
  return (
    <WorldStage
      projection={worldContext.projection}
      context={worldContext}
      onActivateAgent={onActivateAgent}
      onActivateRoom={onActivateRoom}
    />
  );
}

function WorldStage({
  projection,
  context,
  onActivateAgent,
  onActivateRoom,
}: {
  projection: HerdrOfficeProjection;
  context: WorldSurfaceContext;
  onActivateAgent: (key: string) => void;
  onActivateRoom: (key: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const conversationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [conversationAnchors, setConversationAnchors] = useState<OfficeConversationAnchors>({});
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [conversationRects, setConversationRects] = useState<Record<string, DOMRect>>({});
  const [conversationGeometry, setConversationGeometry] = useState<Record<string, ConversationGeometry>>({});
  const [conversationInteraction, setConversationInteraction] = useState<{
    id: string;
    mode: "moving" | "resizing";
  } | null>(null);
  const [conversationOrder, setConversationOrder] = useState<string[]>([]);
  const conversationGeometryRef = useRef<Record<string, ConversationGeometry>>({});
  const conversationGeometryFrameRef = useRef<number | null>(null);
  const conversationInteractionRef = useRef<{
    id: string;
    mode: "moving" | "resizing";
    pointerId: number;
    startX: number;
    startY: number;
    geometry: ConversationGeometry;
  } | null>(null);
  const selection = findOfficeSelection(projection, context.selectedKey);

  const panelIds = context.conversationBubbles.map(({ id }) => id);
  const panelIdsKey = panelIds.join("|");

  useEffect(() => () => {
    if (conversationGeometryFrameRef.current !== null) {
      window.cancelAnimationFrame(conversationGeometryFrameRef.current);
      conversationGeometryFrameRef.current = null;
    }
  }, []);

  const scheduleConversationGeometryRender = () => {
    if (conversationGeometryFrameRef.current !== null) {
      return;
    }
    conversationGeometryFrameRef.current = window.requestAnimationFrame(() => {
      conversationGeometryFrameRef.current = null;
      setConversationGeometry({ ...conversationGeometryRef.current });
    });
  };

  const updateConversationGeometry = (id: string, next: ConversationGeometry) => {
    const shell = shellRef.current;
    if (!shell || context.compact) {
      return;
    }
    const geometry = clampConversationGeometry(next, shell.clientWidth, shell.clientHeight);
    const current = conversationGeometryRef.current[id];
    if (
      current &&
      current.left === geometry.left &&
      current.top === geometry.top &&
      current.width === geometry.width &&
      current.height === geometry.height
    ) {
      return;
    }
    conversationGeometryRef.current = { ...conversationGeometryRef.current, [id]: geometry };
    scheduleConversationGeometryRender();
  };

  const measuredConversationGeometry = (id: string) => {
    const shell = shellRef.current;
    const conversation = conversationRefs.current[id];
    if (!shell || !conversation) {
      return null;
    }
    const shellRect = shell.getBoundingClientRect();
    const conversationRect = conversation.getBoundingClientRect();
    return clampConversationGeometry({
      left: conversationRect.left - shellRect.left,
      top: conversationRect.top - shellRect.top,
      width: conversationRect.width,
      height: conversationRect.height,
    }, shell.clientWidth, shell.clientHeight);
  };

  const setConversationRef = (id: string, element: HTMLDivElement | null) => {
    if (element) {
      conversationRefs.current[id] = element;
    } else {
      delete conversationRefs.current[id];
    }
  };

  const syncConversationGeometry = () => {
    const shell = shellRef.current;
    if (!shell || context.compact || shell.clientWidth <= 0 || shell.clientHeight <= 0) {
      return;
    }
    const next: Record<string, ConversationGeometry> = {};
    for (const [index, panel] of context.conversationBubbles.entries()) {
      const current = conversationGeometryRef.current[panel.id];
      if (current) {
        next[panel.id] = clampConversationGeometry(
          current,
          shell.clientWidth,
          shell.clientHeight,
        );
        continue;
      }
      const base = defaultConversationGeometry(shell.clientWidth, shell.clientHeight);
      next[panel.id] = clampConversationGeometry(
        { ...base, left: base.left + index * 34, top: base.top + index * 28 },
        shell.clientWidth,
        shell.clientHeight,
      );
    }
    const currentKeys = Object.keys(conversationGeometryRef.current);
    const changed =
      currentKeys.length !== Object.keys(next).length ||
      Object.entries(next).some(([id, geometry]) => {
        const current = conversationGeometryRef.current[id];
        return !current ||
          current.left !== geometry.left ||
          current.top !== geometry.top ||
          current.width !== geometry.width ||
          current.height !== geometry.height;
      });
    if (changed) {
      conversationGeometryRef.current = next;
      setConversationGeometry(next);
    }
  };

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const measure = () => {
      const shellRect = shell.getBoundingClientRect();
      const nextSize = { width: shell.clientWidth, height: shell.clientHeight };
      setShellSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      );
      syncConversationGeometry();
      const nextRects: Record<string, DOMRect> = {};
      for (const panel of context.conversationBubbles) {
        const bubble = conversationRefs.current[panel.id];
        if (bubble) {
          nextRects[panel.id] = bubble.getBoundingClientRect();
        }
      }
      setConversationRects(nextRects);
      if (shellRect.width <= 0 || shellRect.height <= 0) {
        return;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    for (const panel of context.conversationBubbles) {
      const conversation = conversationRefs.current[panel.id];
      if (conversation) {
        observer.observe(conversation);
      }
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [context.compact, panelIdsKey]);

  useLayoutEffect(() => {
    const nextRects: Record<string, DOMRect> = {};
    for (const panel of context.conversationBubbles) {
      const bubble = conversationRefs.current[panel.id];
      if (bubble) {
        nextRects[panel.id] = bubble.getBoundingClientRect();
      }
    }
    setConversationRects(nextRects);
  }, [context.conversationBubbles, conversationGeometry]);

  useEffect(() => {
    const ids = new Set(panelIds);
    if (context.compact) {
      conversationGeometryRef.current = {};
      setConversationGeometry({});
    } else {
      const nextGeometry = Object.fromEntries(
        Object.entries(conversationGeometryRef.current).filter(([id]) => ids.has(id)),
      );
      conversationGeometryRef.current = nextGeometry;
      setConversationGeometry(nextGeometry);
    }
    setConversationAnchors((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => ids.has(id)),
    ));
    setConversationRects((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => ids.has(id)),
    ));
    setConversationOrder((current) => [
      ...current.filter((id) => ids.has(id)),
      ...panelIds.filter((id) => !current.includes(id)),
    ]);
    if (panelIds.length === 0) {
      conversationInteractionRef.current = null;
      setConversationInteraction(null);
    }
  }, [context.compact, panelIdsKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const focusedId = [...conversationOrder].reverse().find((id) => panelIds.includes(id));
      if (!focusedId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      context.onCloseConversation(focusedId);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [context, conversationOrder, panelIdsKey]);

  const focusConversation = (id: string) => {
    setConversationOrder((current) => [...current.filter((value) => value !== id), id]);
    context.onFocusConversation(id);
  };

  const beginConversationInteraction = (id: string, event: ReactPointerEvent<HTMLElement>) => {
    if (context.compact || event.button !== 0) {
      return;
    }
    focusConversation(id);
    const target = event.target instanceof Element ? event.target : null;
    const resizeHandle = target?.closest("[data-world-conversation-resize='true']");
    const header = target?.closest(".world-conversation-header");
    if (!resizeHandle && !header) {
      return;
    }
    if (header && target?.closest("button, a, input, textarea, select")) {
      return;
    }
    const geometry = conversationGeometryRef.current[id] ?? measuredConversationGeometry(id);
    const slot = conversationRefs.current[id];
    if (!geometry || !slot) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    slot.setPointerCapture(event.pointerId);
    conversationInteractionRef.current = {
      id,
      mode: resizeHandle ? "resizing" : "moving",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    setConversationInteraction({ id, mode: resizeHandle ? "resizing" : "moving" });
  };

  const moveConversationInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = conversationInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    updateConversationGeometry(
      interaction.id,
      interaction.mode === "moving"
        ? moveConversationGeometry(
            interaction.geometry,
            deltaX,
            deltaY,
            shell.clientWidth,
            shell.clientHeight,
          )
        : resizeConversationGeometry(
            interaction.geometry,
            deltaX,
            deltaY,
            shell.clientWidth,
            shell.clientHeight,
          ),
    );
  };

  const endConversationInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = conversationInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const slot = event.currentTarget;
    if (slot?.hasPointerCapture(event.pointerId)) {
      slot.releasePointerCapture(event.pointerId);
    }
    conversationInteractionRef.current = null;
    setConversationInteraction(null);
  };

  const moveConversationWithKeyboard = (id: string, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (context.compact || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const isHeader = Boolean(target?.closest(".world-conversation-header"));
    const isResize = Boolean(target?.closest("[data-world-conversation-resize='true']"));
    if (!isHeader && !isResize) {
      return;
    }
    if (!isResize && target?.closest("button, a, input, textarea, select")) {
      return;
    }
    const shell = shellRef.current;
    if (conversationOrder[conversationOrder.length - 1] !== id) {
      focusConversation(id);
    }
    const geometry = conversationGeometryRef.current[id] ?? measuredConversationGeometry(id);
    if (!shell || !geometry) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const deltaX = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const deltaY = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    updateConversationGeometry(
      id,
      isResize
        ? resizeConversationGeometry(geometry, deltaX, deltaY, shell.clientWidth, shell.clientHeight)
        : moveConversationGeometry(geometry, deltaX, deltaY, shell.clientWidth, shell.clientHeight),
    );
  };

  const connector = (() => {
    const shell = shellRef.current;
    if (
      !shell ||
      context.conversationBubbles.length === 0 ||
      shellSize.width <= 0 ||
      shellSize.height <= 0
    ) {
      return null;
    }
    const shellRect = shell.getBoundingClientRect();
    const paths = context.conversationBubbles.flatMap((panel) => {
      const conversationRect = conversationRects[panel.id];
      const anchors = conversationAnchors[panel.id];
      if (!conversationRect || !anchors) {
        return [];
      }
      const bubbleLeft = conversationRect.left - shellRect.left;
      const bubbleRight = conversationRect.right - shellRect.left;
      const bubbleTop = conversationRect.top - shellRect.top;
      const bubbleBottom = conversationRect.bottom - shellRect.top;
      const bubbleCenterX = (bubbleLeft + bubbleRight) / 2;
      return (["workbench", "agent"] as const).flatMap((kind) => {
        const anchor = anchors[kind];
        if (!anchor) {
          return [];
        }
        const targetX = anchor.x - shellRect.left;
        const targetY = anchor.y - shellRect.top;
        const edgeX = targetX <= bubbleCenterX ? bubbleLeft : bubbleRight;
        const preferredEdgeY = targetY + (kind === "workbench" ? -10 : 10);
        const edgeY = Math.max(bubbleTop + 22, Math.min(bubbleBottom - 22, preferredEdgeY));
        const bendX = targetX + (edgeX - targetX) * 0.55;
        const path = `M ${targetX.toFixed(1)} ${targetY.toFixed(1)} C ${bendX.toFixed(1)} ${targetY.toFixed(1)}, ${bendX.toFixed(1)} ${edgeY.toFixed(1)}, ${edgeX.toFixed(1)} ${edgeY.toFixed(1)}`;
        return [{
          id: `${panel.id}:${kind}`,
          windowId: panel.id,
          kind,
          path,
          targetX,
          targetY,
          offscreen: anchor.edge,
        }];
      });
    });
    if (paths.length === 0) {
      return null;
    }
    return (
      <svg
        className="world-conversation-connector"
        aria-hidden="true"
        width={shellSize.width}
        height={shellSize.height}
        viewBox={`0 0 ${shellSize.width} ${shellSize.height}`}
        preserveAspectRatio="none"
      >
        {paths.map(({ id, windowId, kind, path, targetX, targetY, offscreen }) => (
          <g key={id} data-anchor={kind} data-window-id={windowId} data-offscreen={offscreen ?? undefined}>
            <path
              data-anchor={kind}
              data-window-id={windowId}
              data-offscreen={offscreen ?? undefined}
              d={path}
            />
            <circle
              data-anchor={kind}
              data-window-id={windowId}
              data-offscreen={offscreen ?? undefined}
              cx={targetX}
              cy={targetY}
              r="4"
            />
          </g>
        ))}
      </svg>
    );
  })();

  return (
    <div ref={shellRef} className="world-stage-shell">
      <header className="stage-bar world-stage-bar">
        <button
          className="icon-btn"
          type="button"
          aria-label={context.compact ? "Back to Herdr sidebar" : "Toggle sidebar"}
          title={context.compact ? "Back to sidebar" : "Toggle sidebar"}
          onClick={context.compact ? context.onBackToSidebar : context.onToggleSidebar}
        >
          {context.compact ? <ChevronLeft size={20} /> : <PanelLeft size={18} />}
        </button>
        <div className="stage-id">
          <span className="stage-title">Pixel Office</span>
          <span className="stage-sub">Shared Herdr state · live board in CEO Office</span>
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Scroll to Agent Bar"
          title="Agent Bar"
          onClick={() => scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          })}
        >
          <ArrowDownToLine size={17} />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="Reset office view"
          title="Reset view"
          onClick={() => scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" })}
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="world-new-seat btn"
          type="button"
          disabled={!context.newSeatSupported}
          title={context.newSeatSupported ? "Start a new Herdr-backed seat" : "New seats are unavailable on this host"}
          onClick={context.onNewSeat}
        >
          <Plus size={15} aria-hidden="true" />
          <span>New seat</span>
        </button>
      </header>
      <div className="world-stage-notice" role="status">
        <span>Live admitted state is shown on the CEO Office blackboard</span>
        <span>Double-click a room or agent to open it in Spaces</span>
        {projection.coverage.staleHosts ? (
          <span className="world-notice-stale">
            <AlertTriangle size={13} aria-hidden="true" />
            {projection.coverage.staleHosts} stale host · animation and handoff suppressed
          </span>
        ) : null}
        {context.handoffStatus ? (
          <span className="world-notice-handoff" role="status">{context.handoffStatus}</span>
        ) : null}
      </div>
      {selection ? (
        <WorldSelectionPanel
          selection={selection}
          activityTransitions={context.agentActivityTransitions}
          onActivateAgent={onActivateAgent}
          onActivateRoom={onActivateRoom}
          onClear={() => context.onSelect(null)}
        />
      ) : null}
      <div
        ref={scrollRef}
        className="world-stage-scroll"
        role="region"
        aria-label="Scrollable Pixel Office scene"
        tabIndex={0}
      >
        <PixelOfficeCanvas
          projection={projection}
          observability={context.observability}
          selectedKey={context.selectedKey}
          completionSeenKeys={context.completionSeenKeys}
          conversationTargets={context.conversationBubbles.map((panel): OfficeConversationAnchorTarget => ({
            id: panel.id,
            selectedKey: panel.selectedKey,
            targetKey: panel.targetKey,
          }))}
          onSelect={context.onSelect}
          onActivateAgent={onActivateAgent}
          onActivateRoom={onActivateRoom}
          onAnchorChange={(anchors) => setConversationAnchors(anchors ?? {})}
        />
      </div>
      {connector}
      {context.conversationBubbles.map((panel) => {
        const geometry = conversationGeometry[panel.id];
        const orderIndex = conversationOrder.indexOf(panel.id);
        const interaction = conversationInteraction?.id === panel.id
          ? conversationInteraction.mode
          : undefined;
        return (
          <div
            key={panel.id}
            ref={(element) => setConversationRef(panel.id, element)}
            className="world-conversation-slot"
            data-window-id={panel.id}
            data-positioned={geometry ? "true" : "false"}
            data-active={orderIndex === conversationOrder.length - 1 ? "true" : undefined}
            data-interaction={interaction}
            aria-busy={interaction !== undefined}
            style={geometry && !context.compact ? {
              left: `${geometry.left}px`,
              top: `${geometry.top}px`,
              width: `${geometry.width}px`,
              height: `${geometry.height}px`,
              zIndex: 20 + Math.max(0, orderIndex),
            } : undefined}
            onPointerDown={(event) => {
              focusConversation(panel.id);
              beginConversationInteraction(panel.id, event);
            }}
            onPointerMove={moveConversationInteraction}
            onPointerUp={endConversationInteraction}
            onPointerCancel={endConversationInteraction}
            onKeyDown={(event) => moveConversationWithKeyboard(panel.id, event)}
          >
            {panel.content}
            {!context.compact ? (
              <button
                type="button"
                className="world-conversation-resize"
                data-world-conversation-resize="true"
                aria-label="Resize agent conversation"
                title="Resize conversation"
                onPointerDown={(event) => beginConversationInteraction(panel.id, event)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WorldSelectionPanel({
  selection,
  activityTransitions,
  onActivateAgent,
  onActivateRoom,
  onClear,
}: {
  selection: OfficeSelection;
  activityTransitions: ReadonlyMap<string, number>;
  onActivateAgent: (key: string) => void;
  onActivateRoom: (key: string) => void;
  onClear: () => void;
}) {
  const title = selection.kind === "agent"
    ? selection.agent.displayLabel
    : selection.kind === "desk"
      ? selection.desk.desk.displayLabel
      : selection.kind === "room"
        ? selection.room.displayLabel
        : selection.host.displayLabel;
  const kindLabel = selection.kind === "agent"
    ? "Agent"
    : selection.kind === "desk"
      ? "Desk"
      : selection.kind === "room"
        ? "Room"
        : "Host";

  return (
    <section className="world-selection-panel" aria-labelledby="world-selection-title">
      <div className="world-selection-heading">
        <div>
          <div className="world-selection-eyebrow">Selected {kindLabel}</div>
          <strong id="world-selection-title">{title}</strong>
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Clear Office selection"
          title="Clear selection"
          onClick={onClear}
        >
          <X size={16} />
        </button>
      </div>
      <dl className="world-selection-details">
        {selection.kind === "agent" ? (
          <>
            <SelectionDetail label="State">
              {selection.agent.stale ? "stale" : selection.agent.semanticStatus}
            </SelectionDetail>
            <SelectionDetail label="Location">
              {selection.entry.roomLabel} · {selection.entry.hostLabel}
            </SelectionDetail>
            <SelectionDetail label="Activity">
              {formatOfficeActivityAge(
                activityTransitions.get(
                  agentActivityKey(
                    selection.agent.hostKey,
                    selection.agent.currentPaneRef.nativeTargetId,
                    selection.agent.currentTerminalRef.nativeTargetId,
                  ),
                ),
              ) ?? "No transition data available"}
            </SelectionDetail>
            {selection.agent.stateLabels[selection.agent.semanticStatus] ? (
              <SelectionDetail label="Status label">
                {selection.agent.stateLabels[selection.agent.semanticStatus]}
              </SelectionDetail>
            ) : null}
          </>
        ) : selection.kind === "desk" ? (
          <>
            <SelectionDetail label="Host">
              {selection.desk.hostLabel}
            </SelectionDetail>
            <SelectionDetail label="Occupant">
              {selection.desk.desk.occupantAgentKey ? "Occupied" : "Empty"}
            </SelectionDetail>
            {selection.desk.desk.completionAgentKeys.length > 0 ? (
              <SelectionDetail label="Completed">
                {selection.desk.desk.completionAgentKeys.length}
              </SelectionDetail>
            ) : null}
          </>
        ) : selection.kind === "room" ? (
          <>
            <SelectionDetail label="Host">{selection.room.hostLabel}</SelectionDetail>
            <SelectionDetail label="State">
              {selection.room.stale ? "stale" : "live"}
            </SelectionDetail>
          </>
        ) : (
          <>
            <SelectionDetail label="Connection">
              {selection.host.connectionState}
            </SelectionDetail>
            <SelectionDetail label="Office">
              {selection.host.compatibleWithWorld ? "compatible" : "unavailable"}
            </SelectionDetail>
          </>
        )}
      </dl>
      {selection.kind === "agent" && selection.agent.stale ? (
        <p className="world-selection-gap">
          This host is stale, so handoff is suppressed until the next admitted snapshot.
        </p>
      ) : selection.kind === "agent" && !selection.agent.canOpenInSpaces ? (
        <p className="world-selection-gap">
          Spaces handoff is unavailable for this current host connection.
        </p>
      ) : null}
      <div className="world-selection-actions">
        {selection.kind === "agent" && selection.agent.canOpenInSpaces ? (
          <button className="world-handoff" type="button" onClick={() => onActivateAgent(selection.agent.key)}>
            <ExternalLink size={14} aria-hidden="true" />
            Open in Spaces
          </button>
        ) : null}
        {selection.kind === "desk" && selection.desk.desk.canOpenInSpaces ? (
          <button className="world-handoff" type="button" onClick={() => onActivateRoom(selection.desk.desk.roomKey)}>
            <ExternalLink size={14} aria-hidden="true" />
            Open room in Spaces
          </button>
        ) : null}
        {selection.kind === "room" && selection.room.canOpenInSpaces ? (
          <button className="world-handoff" type="button" onClick={() => onActivateRoom(selection.room.key)}>
            <ExternalLink size={14} aria-hidden="true" />
            Open in Spaces
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SelectionDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function isWorldSurfaceContext(value: unknown): value is WorldSurfaceContext {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<WorldSurfaceContext>;
  return (
    typeof record.onSelect === "function" &&
    typeof record.onBackToSidebar === "function" &&
    typeof record.onToggleSidebar === "function" &&
    typeof record.onOpenInSpaces === "function" &&
    typeof record.onNewSeat === "function" &&
    Boolean(record.projection)
  );
}
