import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  PanelLeft,
  RotateCcw,
} from "lucide-react";
import { useRef } from "react";
import type { SurfaceComponentProps } from "../surfaceRegistry";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
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
  return (
    <div className="world-stage-shell">
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
          onSelect={context.onSelect}
          onActivateAgent={onActivateAgent}
          onActivateRoom={onActivateRoom}
        />
      </div>
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
