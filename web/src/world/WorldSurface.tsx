import {
  ChevronLeft,
  PanelLeft,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SurfaceComponentProps } from "../surfaceRegistry";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
import type {
  OfficeConversationAnchors,
  OfficeConversationAnchorTarget,
  OfficeCanvasAnchor,
  OfficeCanvasHover,
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
import { officeCalloutForKey } from "./officeSelection";
import type { OfficeCallout } from "./officeSelection";
import type { OfficeObservability } from "./officeObservability";
import { deskAnchor, OFFICE_GEOMETRY } from "./officeGeometry";
import type { OfficeLayout } from "./officeGeometry";
import {
  MAX_SAVED_WORLD_WINDOWS,
  readWorldViewPrefs,
  writeWorldViewPrefs,
} from "./worldViewPrefs";
import {
  officeAgentHandoffRequest,
  officeRoomHandoffRequest,
} from "./herdrOfficeHandoff";
import type { OfficeHandoffRequest } from "./herdrOfficeHandoff";

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
  canCreateSeat: (roomKey: string) => boolean;
  onNewSeat: (roomKey?: string) => void;
  canCreateRoom: (roomKey?: string) => boolean;
  onCreateRoom: (roomKey?: string) => void;
  canRenameRoom: (roomKey: string) => boolean;
  onRenameRoom: (roomKey: string) => void;
  canCloseRoom: (roomKey: string) => boolean;
  onCloseRoom: (roomKey: string) => void;
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
    providerId: null,
    sourceCount: 0,
    configuredSourceCount: 0,
    failedSourceCount: 0,
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
  canCreateSeat: () => false,
  onNewSeat: () => {},
  canCreateRoom: () => false,
  onCreateRoom: () => {},
  canRenameRoom: () => false,
  onRenameRoom: () => {},
  canCloseRoom: () => false,
  onCloseRoom: () => {},
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
  const [initialSavedView] = useState(readWorldViewPrefs);
  const savedViewRef = useRef(initialSavedView);
  const scrollRestoreRef = useRef(false);
  const scrollSaveTimerRef = useRef<number | null>(null);
  const [conversationAnchors, setConversationAnchors] = useState<OfficeConversationAnchors>({});
  const [officeLayout, setOfficeLayout] = useState<OfficeLayout | null>(null);
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [conversationRects, setConversationRects] = useState<Record<string, DOMRect>>({});
  const [conversationGeometry, setConversationGeometry] = useState<Record<string, ConversationGeometry>>({});
  const [conversationInteraction, setConversationInteraction] = useState<{
    id: string;
    mode: "moving" | "resizing";
  } | null>(null);
  const [conversationOrder, setConversationOrder] = useState<string[]>(() =>
    savedViewRef.current.order,
  );
  const [canvasHover, setCanvasHover] = useState<(OfficeCanvasHover & { left: number; top: number }) | null>(null);
  const [selectedCanvasAnchor, setSelectedCanvasAnchor] = useState<(OfficeCanvasAnchor & { left: number; top: number }) | null>(null);
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

  const persistWorldView = useCallback(() => {
    const geometry = {
      ...savedViewRef.current.geometry,
      ...conversationGeometryRef.current,
    };
    savedViewRef.current = {
      geometry,
      order: conversationOrder.filter(Boolean).slice(0, MAX_SAVED_WORLD_WINDOWS),
      scrollTop: Math.max(0, scrollRef.current?.scrollTop ?? savedViewRef.current.scrollTop),
    };
    writeWorldViewPrefs(savedViewRef.current);
  }, [conversationOrder]);

  const scheduleWorldViewPersist = useCallback(() => {
    if (scrollSaveTimerRef.current !== null) {
      window.clearTimeout(scrollSaveTimerRef.current);
    }
    scrollSaveTimerRef.current = window.setTimeout(() => {
      scrollSaveTimerRef.current = null;
      persistWorldView();
    }, 120);
  }, [persistWorldView]);
  const panelIds = context.conversationBubbles.map(({ id }) => id);
  const panelIdsKey = panelIds.join("|");
  const selectedRoomKey = projection.rooms.find(({ key }) => key === context.selectedKey)?.key ??
    projection.deskRoster.find(({ desk }) => desk.key === context.selectedKey)?.desk.roomKey ??
    projection.roster.find(({ agent }) => agent.key === context.selectedKey)?.agent.roomKey ??
    null;
  const onCanvasHover = (hover: OfficeCanvasHover | null) => {
    if (!hover) {
      setCanvasHover(null);
      return;
    }
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    setCanvasHover({
      ...hover,
      left: hover.clientX - shellRect.left,
      top: hover.clientY - shellRect.top,
    });
  };

  const onSelectedCanvasAnchorChange = (anchor: OfficeCanvasAnchor | null) => {
    if (!anchor) {
      setSelectedCanvasAnchor(null);
      return;
    }
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    setSelectedCanvasAnchor({
      ...anchor,
      left: anchor.x - shellRect.left,
      top: anchor.y - shellRect.top,
    });
  };

  useEffect(() => () => {
    if (conversationGeometryFrameRef.current !== null) {
      window.cancelAnimationFrame(conversationGeometryFrameRef.current);
      conversationGeometryFrameRef.current = null;
    }
    if (scrollSaveTimerRef.current !== null) {
      window.clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = null;
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

  useEffect(() => {
    if (context.compact || scrollRestoreRef.current) {
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) {
      return;
    }
    const restore = () => {
      scroll.scrollTop = savedViewRef.current.scrollTop;
      scrollRestoreRef.current = true;
    };
    const frame = window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [context.compact, projection.generatedAt]);

  useEffect(() => {
    if (context.compact) {
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) {
      return;
    }
    const onScroll = () => scheduleWorldViewPersist();
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", onScroll);
  }, [context.compact, scheduleWorldViewPersist]);

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
        panelIds.flatMap((id) => {
          const geometry = conversationGeometryRef.current[id] ?? savedViewRef.current.geometry[id];
          return geometry ? [[id, geometry] as const] : [];
        }),
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
      ...(current.length > 0 ? current : savedViewRef.current.order).filter((id) => ids.has(id)),
      ...panelIds.filter((id) => !(current.length > 0 ? current : savedViewRef.current.order).includes(id)),
    ]);
    if (panelIds.length === 0) {
      conversationInteractionRef.current = null;
      setConversationInteraction(null);
    }
  }, [context.compact, panelIdsKey]);

  useEffect(() => {
    if (!context.compact) {
      persistWorldView();
    }
  }, [context.compact, conversationGeometry, conversationOrder, persistWorldView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const eventTarget = event.target instanceof Element ? event.target : null;
      const activeElement = document.activeElement;
      const terminalHasFocus = Boolean(
        eventTarget?.closest(".world-conversation-terminal")
          || (activeElement instanceof Element
            && activeElement.closest(".world-conversation-terminal")),
      );
      if (terminalHasFocus) {
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
          aria-label="Reset office view"
          title="Reset view"
          onClick={() => scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" })}
        >
          <RotateCcw size={16} />
        </button>
      </header>
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
          canCreateSeat={context.canCreateSeat}
          onNewSeat={context.onNewSeat}
          onLayoutChange={setOfficeLayout}
          onHover={onCanvasHover}
          onAnchorChange={(anchors) => setConversationAnchors(anchors ?? {})}
          onSelectedAnchorChange={onSelectedCanvasAnchorChange}
        >
          <WorldAgentBar
            className="world-canvas-agent-bar"
            projection={projection}
            selectedKey={context.selectedKey}
            onSelect={context.onSelect}
            onActivateAgent={onActivateAgent}
          />
          {officeLayout ? (
            <WorldRoomActions
              layout={officeLayout}
              projection={projection}
              selectedRoomKey={selectedRoomKey}
              context={context}
            />
          ) : null}
        </PixelOfficeCanvas>
      </div>
      {context.selectedKey && selectedCanvasAnchor ? (
        <WorldCanvasCallout
          callout={officeCalloutForKey(projection, context.selectedKey)}
          left={selectedCanvasAnchor.left}
          top={selectedCanvasAnchor.top}
          persistent
        />
      ) : null}
      {canvasHover && !(canvasHover.key === context.selectedKey && officeCalloutForKey(projection, canvasHover.key)?.summary) ? (
        <WorldCanvasCallout
          callout={officeCalloutForKey(projection, canvasHover.key)}
          left={canvasHover.left}
          top={canvasHover.top}
        />
      ) : null}
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

function WorldCanvasCallout({
  callout,
  left,
  top,
  persistent = false,
}: {
  callout: OfficeCallout | null;
  left: number;
  top: number;
  persistent?: boolean;
}) {
  if (!callout) {
    return null;
  }
  return (
    <div
      className={`world-canvas-callout${persistent ? " world-canvas-callout-persistent" : ""}`}
      data-kind={callout.kind}
      data-status={callout.status ?? undefined}
      style={{ left: `${left}px`, top: `${top}px` }}
      role={persistent ? "status" : "tooltip"}
      aria-live={persistent ? "polite" : undefined}
    >
      <strong>{callout.title}</strong>
      {callout.summary ? <span className="world-canvas-callout-summary">{callout.summary}</span> : null}
      <span>{callout.detail}</span>
    </div>
  );
}

function WorldRoomActions({
  layout,
  projection,
  selectedRoomKey,
  context,
}: {
  layout: OfficeLayout;
  projection: HerdrOfficeProjection;
  selectedRoomKey: string | null;
  context: WorldSurfaceContext;
}) {
  const roomBottom = layout.rooms.reduce(
    (bottom, room) => Math.max(bottom, room.y + room.height),
    layout.roomStartY,
  );
  return (
    <div className="world-room-actions-overlay" aria-label="Office room actions">
      {projection.rooms.map((room, index) => {
        const rect = layout.rooms[index];
        if (!rect) {
          return null;
        }
        return (
          <div
            key={room.key}
            className="world-room-actions"
            style={{ left: `${rect.x + rect.width - 62}px`, top: `${rect.y - 5}px` }}
          >
            <button
              className="world-room-overlay-action"
              type="button"
              aria-label={`Rename room ${room.displayLabel}`}
              title={`Rename ${room.displayLabel}`}
              disabled={!context.canRenameRoom(room.key)}
              onClick={() => context.onRenameRoom(room.key)}
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button
              className="world-room-overlay-action world-room-overlay-action-danger"
              type="button"
              aria-label={`Close room ${room.displayLabel}`}
              title={`Close ${room.displayLabel}`}
              disabled={!context.canCloseRoom(room.key)}
              onClick={() => context.onCloseRoom(room.key)}
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {projection.rooms.map((room, index) => {
        const rect = layout.rooms[index];
        if (
          !rect ||
          room.desks.length >= OFFICE_GEOMETRY.desksPerRoom ||
          !context.canCreateSeat(room.key)
        ) {
          return null;
        }
        const anchor = deskAnchor(rect, room.desks.length);
        return (
          <button
            key={`${room.key}:new-seat`}
            className="world-new-seat-canvas-action"
            type="button"
            aria-label={`New seat in ${room.displayLabel}`}
            title={`Start a new seat in ${room.displayLabel}`}
            style={{ left: `${anchor.x - 25}px`, top: `${anchor.deskY}px` }}
            onClick={() => context.onNewSeat(room.key)}
          />
        );
      })}
      {context.canCreateRoom(selectedRoomKey ?? undefined) ? (
        <button
          className="world-new-room-canvas-action"
          type="button"
          aria-label="New room"
          title="Create a new Herdr workspace"
          style={{ left: `${layout.officeWidth / 2 - 28}px`, top: `${roomBottom + 8}px` }}
          onClick={() => context.onCreateRoom(selectedRoomKey ?? undefined)}
        >
          <Plus size={24} aria-hidden="true" />
          <span>NEW ROOM</span>
        </button>
      ) : null}
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
    typeof record.canCreateSeat === "function" &&
    typeof record.onNewSeat === "function" &&
    typeof record.canCreateRoom === "function" &&
    typeof record.onCreateRoom === "function" &&
    typeof record.canRenameRoom === "function" &&
    typeof record.onRenameRoom === "function" &&
    typeof record.canCloseRoom === "function" &&
    typeof record.onCloseRoom === "function" &&
    Boolean(record.projection)
  );
}

function WorldAgentBar({
  className,
  projection,
  selectedKey,
  onSelect,
  onActivateAgent,
}: {
  className?: string;
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onActivateAgent: (key: string) => void;
}) {
  const idleCount = projection.barAgents.filter(({ semanticStatus }) => semanticStatus === "idle").length;
  const blockedCount = projection.barAgents.filter(({ semanticStatus }) => semanticStatus === "blocked").length;
  const overflowCount = projection.coverage.omittedBarAgents;
  return (
    <section
      className={`world-office-overview${className ? ` ${className}` : ""}`}
      aria-label="Agent Bar"
    >
      <div className="world-overview-heading">
        <strong>Agent Bar</strong>
        <span>{projection.barAgents.length} visible · {idleCount} idle · {blockedCount} needs input</span>
      </div>
      <ul className="world-agent-bar" aria-label="Agent Bar">
        {projection.barAgents.length === 0 ? (
          <li className="world-agent-bar-empty">No completed or waiting agents</li>
        ) : (
          projection.barAgents.map((agent) => {
            const status = agent.stale ? "stale" : agent.semanticStatus;
            const statusLabel = agent.stale
              ? "STALE"
              : agent.stateLabels[agent.semanticStatus] ?? agent.semanticStatus.toUpperCase();
            return (
              <li key={agent.key} className="world-agent-bar-item-shell">
                <button
                  className="world-agent-bar-item"
                  type="button"
                  aria-pressed={selectedKey === agent.key}
                  data-status={status}
                  title={agent.taskSummary ?? `${agent.displayLabel} · ${statusLabel}`}
                  onClick={() => onSelect(agent.key)}
                  onDoubleClick={() => onActivateAgent(agent.key)}
                >
                  <img
                    className="world-agent-bar-avatar"
                    src={`/world/characters/${agent.characterIndex + 1}-D-1.png`}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="world-agent-bar-name">{agent.displayLabel}</span>
                  <span className="world-agent-bar-state">{statusLabel}</span>
                </button>
              </li>
            );
          })
        )}
        {overflowCount > 0 ? (
          <li className="world-agent-bar-overflow">+{overflowCount} more in roster</li>
        ) : null}
      </ul>
    </section>
  );
}
