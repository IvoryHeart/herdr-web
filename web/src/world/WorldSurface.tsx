import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  PanelLeft,
  RotateCcw,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SurfaceComponentProps } from "../surfaceRegistry";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
import type { OfficeCanvasAnchor, OfficeCanvasAnchors } from "./PixelOfficeCanvas";
import {
  clampConversationGeometry,
  moveConversationGeometry,
  resizeConversationGeometry,
} from "./conversationGeometry";
import type { ConversationGeometry } from "./conversationGeometry";
import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import { OFFICE_PRESENTATION_BOUNDS } from "./herdrOfficeProjection";
import {
  officeAgentHandoffRequest,
  officeRoomHandoffRequest,
} from "./herdrOfficeHandoff";
import type { OfficeHandoffRequest } from "./herdrOfficeHandoff";

export type WorldSurfaceContext = {
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  compact: boolean;
  onBackToSidebar: () => void;
  onToggleSidebar: () => void;
  onOpenInSpaces: (request: OfficeHandoffRequest) => void;
  handoffStatus: string | null;
  conversationBubble: ReactNode | null;
  conversationTargetKey: string | null;
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
  onSelect: () => {},
  compact: false,
  onBackToSidebar: () => {},
  onToggleSidebar: () => {},
  onOpenInSpaces: () => {},
  handoffStatus: null,
  conversationBubble: null,
  conversationTargetKey: null,
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
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const [conversationAnchors, setConversationAnchors] = useState<OfficeCanvasAnchors | null>(null);
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [conversationRect, setConversationRect] = useState<DOMRect | null>(null);
  const [conversationGeometry, setConversationGeometry] = useState<ConversationGeometry | null>(null);
  const [conversationInteraction, setConversationInteraction] = useState<"moving" | "resizing" | null>(null);
  const conversationGeometryRef = useRef<ConversationGeometry | null>(null);
  const conversationInteractionRef = useRef<{
    mode: "moving" | "resizing";
    pointerId: number;
    startX: number;
    startY: number;
    geometry: ConversationGeometry;
  } | null>(null);

  const updateConversationGeometry = (next: ConversationGeometry) => {
    const shell = shellRef.current;
    if (!shell || context.compact) {
      return;
    }
    const geometry = clampConversationGeometry(next, shell.clientWidth, shell.clientHeight);
    const current = conversationGeometryRef.current;
    if (
      current &&
      current.left === geometry.left &&
      current.top === geometry.top &&
      current.width === geometry.width &&
      current.height === geometry.height
    ) {
      return;
    }
    conversationGeometryRef.current = geometry;
    setConversationGeometry(geometry);
  };

  const measuredConversationGeometry = () => {
    const shell = shellRef.current;
    const conversation = conversationRef.current;
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
      const bubble = conversationRef.current;
      setConversationRect(bubble ? bubble.getBoundingClientRect() : null);
      if (!context.compact && conversationGeometryRef.current) {
        updateConversationGeometry(conversationGeometryRef.current);
      }
      if (!bubble || shellRect.width <= 0 || shellRect.height <= 0) {
        return;
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    if (conversationRef.current) {
      observer.observe(conversationRef.current);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [context.conversationBubble]);

  useLayoutEffect(() => {
    const bubble = conversationRef.current;
    if (bubble && conversationGeometry) {
      setConversationRect(bubble.getBoundingClientRect());
    }
  }, [conversationGeometry]);

  useEffect(() => {
    if (!context.conversationBubble) {
      setConversationAnchors(null);
      setConversationRect(null);
      conversationGeometryRef.current = null;
      conversationInteractionRef.current = null;
      setConversationGeometry(null);
      setConversationInteraction(null);
    }
  }, [context.compact, context.conversationBubble]);

  useEffect(() => {
    if (context.compact) {
      conversationGeometryRef.current = null;
      setConversationGeometry(null);
    }
  }, [context.compact]);

  const beginConversationInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (context.compact || event.button !== 0) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const resizeHandle = target?.closest("[data-world-conversation-resize='true']");
    const header = target?.closest(".world-conversation-header");
    if (!resizeHandle && !header) {
      return;
    }
    if (header && target?.closest("button, a, input, textarea, select")) {
      return;
    }
    const geometry = conversationGeometryRef.current ?? measuredConversationGeometry();
    const slot = event.currentTarget;
    if (!geometry || !slot) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    slot.setPointerCapture(event.pointerId);
    conversationInteractionRef.current = {
      mode: resizeHandle ? "resizing" : "moving",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    setConversationInteraction(resizeHandle ? "resizing" : "moving");
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

  const moveConversationWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
    const geometry = conversationGeometryRef.current ?? measuredConversationGeometry();
    if (!shell || !geometry) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const deltaX = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const deltaY = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    updateConversationGeometry(
      isResize
        ? resizeConversationGeometry(geometry, deltaX, deltaY, shell.clientWidth, shell.clientHeight)
        : moveConversationGeometry(geometry, deltaX, deltaY, shell.clientWidth, shell.clientHeight),
    );
  };

  const connector = (() => {
    const shell = shellRef.current;
    if (
      !shell ||
      !context.conversationBubble ||
      !context.conversationTargetKey ||
      !conversationRect ||
      shellSize.width <= 0 ||
      shellSize.height <= 0
    ) {
      return null;
    }
    const endpoints: Array<{
      kind: "workbench" | "agent";
      anchor: OfficeCanvasAnchor;
    }> = [];
    for (const kind of ["workbench", "agent"] as const) {
      const anchor = conversationAnchors?.[kind];
      if (anchor?.visible) {
        endpoints.push({ kind, anchor });
      }
    }
    if (endpoints.length === 0) {
      return null;
    }
    const shellRect = shell.getBoundingClientRect();
    const bubbleLeft = conversationRect.left - shellRect.left;
    const bubbleRight = conversationRect.right - shellRect.left;
    const bubbleTop = conversationRect.top - shellRect.top;
    const bubbleBottom = conversationRect.bottom - shellRect.top;
    const bubbleCenterX = (bubbleLeft + bubbleRight) / 2;
    const paths = endpoints.map(({ kind, anchor }) => {
      const targetX = anchor.x - shellRect.left;
      const targetY = anchor.y - shellRect.top;
      const edgeX = targetX <= bubbleCenterX ? bubbleLeft : bubbleRight;
      const preferredEdgeY = targetY + (kind === "workbench" ? -10 : 10);
      const edgeY = Math.max(bubbleTop + 22, Math.min(bubbleBottom - 22, preferredEdgeY));
      const bendX = targetX + (edgeX - targetX) * 0.55;
      const path = `M ${targetX.toFixed(1)} ${targetY.toFixed(1)} C ${bendX.toFixed(1)} ${targetY.toFixed(1)}, ${bendX.toFixed(1)} ${edgeY.toFixed(1)}, ${edgeX.toFixed(1)} ${edgeY.toFixed(1)}`;
      return { kind, path, targetX, targetY };
    });
    return (
      <svg
        className="world-conversation-connector"
        aria-hidden="true"
        width={shellSize.width}
        height={shellSize.height}
        viewBox={`0 0 ${shellSize.width} ${shellSize.height}`}
        preserveAspectRatio="none"
      >
        {paths.map(({ kind, path, targetX, targetY }) => (
          <g key={kind}>
            <path data-anchor={kind} d={path} />
            <circle data-anchor={kind} cx={targetX} cy={targetY} r="4" />
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
      <div
        ref={scrollRef}
        className="world-stage-scroll"
        role="region"
        aria-label="Scrollable Pixel Office scene"
        tabIndex={0}
      >
        <PixelOfficeCanvas
          projection={projection}
          selectedKey={context.selectedKey}
          conversationTargetKey={context.conversationTargetKey}
          onSelect={context.onSelect}
          onActivateAgent={onActivateAgent}
          onActivateRoom={onActivateRoom}
          onAnchorChange={setConversationAnchors}
        />
      </div>
      {connector}
      {context.conversationBubble ? (
        <div
          ref={conversationRef}
          className="world-conversation-slot"
          data-positioned={conversationGeometry ? "true" : "false"}
          data-interaction={conversationInteraction ?? undefined}
          aria-busy={conversationInteraction !== null}
          style={conversationGeometry && !context.compact ? {
            left: `${conversationGeometry.left}px`,
            top: `${conversationGeometry.top}px`,
            width: `${conversationGeometry.width}px`,
            height: `${conversationGeometry.height}px`,
          } : undefined}
          onPointerDown={beginConversationInteraction}
          onPointerMove={moveConversationInteraction}
          onPointerUp={endConversationInteraction}
          onPointerCancel={endConversationInteraction}
          onKeyDown={moveConversationWithKeyboard}
        >
          {context.conversationBubble}
          {!context.compact ? (
            <button
              type="button"
              className="world-conversation-resize"
              data-world-conversation-resize="true"
              aria-label="Resize agent conversation"
              title="Resize conversation"
            />
          ) : null}
        </div>
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
    Boolean(record.projection)
  );
}
