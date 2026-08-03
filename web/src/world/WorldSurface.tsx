import {
  AlertTriangle,
  ArrowDownToLine,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PanelLeft,
  Radio,
  RotateCcw,
  Server,
  Users,
} from "lucide-react";
import { useMemo, useRef } from "react";
import type { SurfaceComponentProps } from "../surfaceRegistry";
import { PixelOfficeCanvas } from "./PixelOfficeCanvas";
import type {
  HerdrOfficeProjection,
  OfficeHost,
  OfficeRoomRosterEntry,
  OfficeRosterEntry,
} from "./herdrOfficeProjection";
import { OFFICE_PRESENTATION_BOUNDS } from "./herdrOfficeProjection";
import type { OfficeHandoffRequest } from "./herdrOfficeHandoff";
import { officeStateNotice } from "./worldState";

const STATUS_FILTERS = ["all", "working", "idle", "blocked", "done", "unknown"] as const;
type WorldStatusFilter = (typeof STATUS_FILTERS)[number];

export type WorldSurfaceContext = {
  projection: HerdrOfficeProjection;
  availableHosts: readonly OfficeHost[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  hostFilter: string;
  hostFilterLocked: boolean;
  onHostFilter: (value: string) => void;
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  rosterPage: number;
  onRosterPage: (page: number) => void;
  compact: boolean;
  onBackToSidebar: () => void;
  onViewOffice: () => void;
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
    reviewAgents: [],
    roomRoster: [],
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
      observedAgents: 0,
      status: { working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 },
      omittedRooms: 0,
      omittedDeskAgents: 0,
      omittedReceptionists: 0,
      omittedReviewAgents: 0,
    },
    presentationBounds: {
      ...OFFICE_PRESENTATION_BOUNDS,
      totalRooms: 0,
      renderedRooms: 0,
      totalReceptionists: 0,
      renderedReceptionists: 0,
      totalReviewAgents: 0,
      renderedReviewAgents: 0,
    },
  },
  availableHosts: [],
  selectedKey: null,
  onSelect: () => {},
  hostFilter: "all",
  hostFilterLocked: false,
  onHostFilter: () => {},
  statusFilter: "all",
  onStatusFilter: () => {},
  rosterPage: 0,
  onRosterPage: () => {},
  compact: false,
  onBackToSidebar: () => {},
  onViewOffice: () => {},
  onToggleSidebar: () => {},
  onOpenInSpaces: () => {},
  handoffStatus: null,
};

export default function WorldSurface({ slot, context }: SurfaceComponentProps) {
  const worldContext = isWorldSurfaceContext(context) ? context : FALLBACK_CONTEXT;
  const projection = useMemo(
    () => filterProjection(
      worldContext.projection,
      normalizeStatusFilter(worldContext.statusFilter),
    ),
    [worldContext.projection, worldContext.statusFilter],
  );
  if (slot === "sidebar") {
    return <WorldSidebar projection={projection} context={worldContext} />;
  }
  return <WorldStage projection={projection} context={worldContext} />;
}

function WorldSidebar({
  projection,
  context,
}: {
  projection: HerdrOfficeProjection;
  context: WorldSurfaceContext;
}) {
  const selected = selectedEntity(context.projection, context.selectedKey);
  const pageCount = Math.max(
    1,
    Math.ceil(projection.roster.length / OFFICE_PRESENTATION_BOUNDS.rosterPage),
  );
  const page = Math.min(context.rosterPage, pageCount - 1);
  const pageAgentKeys = new Set(
    projection.roster
      .slice(
        page * OFFICE_PRESENTATION_BOUNDS.rosterPage,
        (page + 1) * OFFICE_PRESENTATION_BOUNDS.rosterPage,
      )
      .map(({ agent }) => agent.key),
  );
  const groupedRooms = projection.roomRoster.filter((room) => {
    const hasAgents = projection.roster.some(
      (entry) => entry.roomKey === room.key && pageAgentKeys.has(entry.agent.key),
    );
    return hasAgents || projection.roster.length <= OFFICE_PRESENTATION_BOUNDS.rosterPage;
  });
  const stateNotice = officeStateNotice(context.projection.coverage);

  return (
    <div className="world-sidebar" aria-label="World context">
      <section className="world-source-card" aria-labelledby="world-source-heading">
        <div className="world-eyebrow">
          <Radio size={13} aria-hidden="true" />
          <span id="world-source-heading">Shared Herdr runtime</span>
        </div>
        <strong>Live admitted state</strong>
        <p>
          World projects the same validated Herdr snapshots and host connections used by Spaces.
        </p>
        <div className="world-coverage-grid" aria-label="Observed Herdr runtime coverage">
          <CoverageStat value={projection.coverage.observedHosts} label="hosts" />
          <CoverageStat value={projection.coverage.observedWorkspaces} label="spaces" />
          <CoverageStat value={projection.coverage.observedAgents} label="agents" />
          <CoverageStat value={projection.coverage.staleHosts} label="stale" attention />
        </div>
      </section>

      <section className="world-filters" aria-labelledby="world-filter-heading">
        <h2 id="world-filter-heading">Office filters</h2>
        <label>
          <span>Host</span>
          <select
            value={context.hostFilter}
            disabled={context.hostFilterLocked}
            title={
              context.hostFilterLocked
                ? "Choose All in the shared host scope to use the World host filter"
                : "Filter the office by host"
            }
            onChange={(event) => {
              const hostKey = event.currentTarget.value;
              context.onHostFilter(hostKey);
              if (hostKey !== "all") {
                context.onSelect(hostKey);
              }
            }}
          >
            <option value="all">All hosts</option>
            {context.availableHosts.map((host) => (
              <option key={host.key} value={host.key}>
                {host.displayLabel} · {host.deterministicSkin.badge}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={normalizeStatusFilter(context.statusFilter)}
            onChange={(event) => context.onStatusFilter(event.currentTarget.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All named states" : statusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {stateNotice ? (
        <section
          className="world-state-notice"
          data-attention={stateNotice.attention ? "true" : "false"}
          role="status"
        >
          <strong>{stateNotice.title}</strong>
          <span>{stateNotice.description}</span>
        </section>
      ) : null}

      {context.compact ? (
        <button className="world-view-office" type="button" onClick={context.onViewOffice}>
          <Building2 size={15} aria-hidden="true" />
          View office
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      ) : null}

      <WorldInspector
        selected={selected}
        onOpenInSpaces={context.onOpenInSpaces}
        handoffStatus={context.handoffStatus}
      />

      <section className="world-roster" aria-labelledby="world-roster-heading">
        <div className="world-section-heading">
          <div>
            <span className="world-kicker">complete semantic view</span>
            <h2 id="world-roster-heading">Roster</h2>
          </div>
          <span className="world-count mono">{projection.roster.length}</span>
        </div>
        {groupedRooms.length === 0 ? (
          <div className="world-empty">
            <strong>No matching agents</strong>
            <span>Rooms remain available when the status filter is cleared.</span>
          </div>
        ) : (
          groupedRooms.map((room) => (
            <WorldRoomGroup
              key={room.key}
              room={room}
              host={projection.hosts.find((host) => host.key === room.hostKey) ?? null}
              agents={projection.roster.filter(
                (entry) => entry.roomKey === room.key && pageAgentKeys.has(entry.agent.key),
              )}
              selectedKey={context.selectedKey}
              onSelect={context.onSelect}
            />
          ))
        )}
        {pageCount > 1 ? (
          <nav className="world-pagination" aria-label="Roster pages">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => context.onRosterPage(page - 1)}
            >
              <ChevronLeft size={14} aria-hidden="true" /> Previous
            </button>
            <span className="mono">{page + 1} / {pageCount}</span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => context.onRosterPage(page + 1)}
            >
              Next <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function WorldRoomGroup({
  room,
  host,
  agents,
  selectedKey,
  onSelect,
}: {
  room: OfficeRoomRosterEntry;
  host: OfficeHost | null;
  agents: OfficeRosterEntry[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="world-roster-group" data-stale={room.stale ? "true" : "false"}>
      <button
        type="button"
        className="world-room-row"
        data-selected={selectedKey === room.key ? "true" : "false"}
        onClick={() => onSelect(room.key)}
        aria-label={`${room.displayLabel}, ${host?.displayLabel ?? room.hostLabel}, ${room.stale ? "stale" : "live"}`}
      >
        <span
          className="world-host-cue"
          data-theme={host?.deterministicSkin.themeIndex ?? 0}
          aria-hidden="true"
        />
        <span>
          <strong>{room.displayLabel}</strong>
          <small>
            {host?.displayLabel ?? room.hostLabel} · {host?.deterministicSkin.badge ?? "HOST"}
          </small>
        </span>
        <span className="mono">{agents.length}</span>
      </button>
      {agents.length === 0 ? (
        <div className="world-empty-room">No detected agents</div>
      ) : (
        agents.map(({ agent, deskPresented, reviewPresented }) => (
          <button
            key={agent.key}
            type="button"
            className="world-agent-row"
            data-status={agent.semanticStatus}
            data-stale={agent.stale ? "true" : "false"}
            data-selected={selectedKey === agent.key ? "true" : "false"}
            onClick={() => onSelect(agent.key)}
          >
            <span className="world-status-dot" aria-hidden="true" />
            <span>
              <strong>{agent.displayLabel}</strong>
              <small>
                {agent.stale ? "Stale · " : ""}{statusLabel(agent.semanticStatus)}
                {!deskPresented && !reviewPresented ? " · roster overflow" : ""}
              </small>
            </span>
            <span className="world-placement" aria-hidden="true">
              {agent.semanticStatus === "done" ? "review" : deskPresented ? "desk" : "+"}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function WorldInspector({
  selected,
  onOpenInSpaces,
  handoffStatus,
}: {
  selected: SelectedEntity;
  onOpenInSpaces: (request: OfficeHandoffRequest) => void;
  handoffStatus: string | null;
}) {
  const handoffLabel =
    selected.kind === "agent"
      ? "Open agent in Spaces"
      : selected.kind === "room"
        ? "Open space in Spaces"
        : null;
  return (
    <section className="world-inspector" aria-labelledby="world-inspector-heading">
      <div className="world-section-heading">
        <div>
          <span className="world-kicker">selection</span>
          <h2 id="world-inspector-heading">Inspector</h2>
        </div>
      </div>
      <div className="world-inspector-card" aria-live="polite">
        <span className="world-inspector-type">{selected.typeLabel}</span>
        <strong>{selected.label}</strong>
        <p>{selected.description}</p>
        <dl>
          {selected.facts.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {handoffLabel ? (
          <button
            className="world-handoff"
            type="button"
            disabled={!selected.handoffEnabled || !selected.handoff}
            title={
              selected.handoffEnabled
                ? handoffLabel
                : "This target is stale or unavailable in Spaces"
            }
            onClick={() => selected.handoff && onOpenInSpaces(selected.handoff)}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {handoffLabel}
          </button>
        ) : null}
        {handoffStatus ? (
          <small className="world-handoff-status" role="status">{handoffStatus}</small>
        ) : null}
      </div>
    </section>
  );
}

function WorldStage({
  projection,
  context,
}: {
  projection: HerdrOfficeProjection;
  context: WorldSurfaceContext;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="world-stage-shell">
      <header className="stage-bar world-stage-bar">
        <button
          className="icon-btn"
          type="button"
          aria-label={context.compact ? "Back to World roster" : "Toggle sidebar"}
          title={context.compact ? "Back to roster" : "Toggle sidebar"}
          onClick={context.compact ? context.onBackToSidebar : context.onToggleSidebar}
        >
          {context.compact ? <ChevronLeft size={20} /> : <PanelLeft size={18} />}
        </button>
        <div className="stage-id">
          <span className="stage-title">Pixel Office</span>
          <span className="stage-sub">Shared live admitted Herdr state</span>
        </div>
        <div className="world-stage-stat" data-status="working">
          <span>{projection.coverage.status.working}</span> working
        </div>
        <div className="world-stage-stat" data-status="blocked">
          <span>{projection.coverage.status.blocked}</span> needs input
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Scroll to Done to Review"
          title="Done to Review"
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
        <span><Server size={13} aria-hidden="true" /> {projection.coverage.observedHosts} observed hosts</span>
        <span><Users size={13} aria-hidden="true" /> {projection.coverage.observedAgents} detected agents</span>
        {projection.coverage.staleHosts ? (
          <span className="world-notice-stale">
            <AlertTriangle size={13} aria-hidden="true" />
            {projection.coverage.staleHosts} stale host · animation and handoff suppressed
          </span>
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
        />
      </div>
    </div>
  );
}

function CoverageStat({
  value,
  label,
  attention = false,
}: {
  value: number;
  label: string;
  attention?: boolean;
}) {
  return (
    <div data-attention={attention && value > 0 ? "true" : "false"}>
      <strong className="mono">{value}</strong>
      <span>{label}</span>
    </div>
  );
}

type SelectedEntity = {
  kind: "office" | "host" | "room" | "agent";
  typeLabel: string;
  label: string;
  description: string;
  facts: Array<[string, string]>;
  handoff: OfficeHandoffRequest | null;
  handoffEnabled: boolean;
};

function selectedEntity(
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
): SelectedEntity {
  const agentEntry = projection.roster.find(({ agent }) => agent.key === selectedKey);
  if (agentEntry) {
    const agent = agentEntry.agent;
    const host = projection.hosts.find((entry) => entry.key === agent.hostKey);
    return {
      kind: "agent",
      typeLabel: "Detected Herdr agent",
      label: agent.displayLabel,
      description: agent.stale
        ? "Last-known Herdr state. Animation and handoff are suppressed."
        : "Current semantic status from the admitted Herdr pane snapshot.",
      facts: [
        ["Host", `${host?.displayLabel ?? agentEntry.hostLabel} · ${host?.deterministicSkin.badge ?? "HOST"}`],
        ["Workspace", agentEntry.roomLabel],
        ["Status", statusLabel(agent.semanticStatus)],
        ["Freshness", agent.stale ? "stale / last known" : "live"],
        ["Spaces", agent.canOpenInSpaces ? "compatible target" : "handoff unavailable"],
      ],
      handoff: {
        kind: "agent",
        key: agent.key,
        profileId: agent.hostKey,
        observedGeneration: agent.observedGeneration,
        terminalRef: agent.currentTerminalRef,
        currentPaneRef: agent.currentPaneRef,
      },
      handoffEnabled: agent.canOpenInSpaces,
    };
  }
  const room = projection.roomRoster.find((entry) => entry.key === selectedKey);
  if (room) {
    const host = projection.hosts.find((entry) => entry.key === room.hostKey);
    const count = projection.roster.filter((entry) => entry.roomKey === room.key).length;
    return {
      kind: "room",
      typeLabel: "Herdr workspace room",
      label: room.displayLabel,
      description: room.presented
        ? "One exact host/workspace pair in the shared office."
        : "Workspace retained in the semantic roster beyond the visual room bound.",
      facts: [
        ["Host", `${host?.displayLabel ?? room.hostLabel} · ${host?.deterministicSkin.badge ?? "HOST"}`],
        ["Detected agents", String(count)],
        ["Freshness", room.stale ? "stale / last known" : "live"],
        ["Scene", room.presented ? "rendered room" : "roster overflow"],
      ],
      handoff: {
        kind: "room",
        key: room.key,
        profileId: room.hostKey,
        observedGeneration: room.observedGeneration,
        workspaceRef: room.workspaceRef,
      },
      handoffEnabled: room.canOpenInSpaces,
    };
  }
  const host = projection.hosts.find((entry) => entry.key === selectedKey);
  if (host) {
    return {
      kind: "host",
      typeLabel: "Herdr host profile",
      label: `${host.displayLabel} · ${host.deterministicSkin.badge}`,
      description: "Profile-qualified host identity. Similar labels never merge office entities.",
      facts: [
        ["Connection", host.connectionState],
        ["Freshness", host.stale ? "stale / last known" : "live"],
        ["World", host.compatibleWithWorld ? "compatible" : "unavailable"],
        ["Spaces", host.compatibleWithSpaces ? "compatible" : "snapshot only"],
      ],
      handoff: null,
      handoffEnabled: false,
    };
  }
  return {
    kind: "office",
    typeLabel: "Herdr Office",
    label: "Pixel Office",
    description: "One deterministic office projected from host-qualified Herdr snapshot state.",
    facts: [
      ["Observed hosts", String(projection.coverage.observedHosts)],
      ["Workspace rooms", String(projection.coverage.observedWorkspaces)],
      ["Detected agents", String(projection.coverage.observedAgents)],
      ["Source", "validated Herdr snapshot contract"],
    ],
    handoff: null,
    handoffEnabled: false,
  };
}

function filterProjection(
  projection: HerdrOfficeProjection,
  statusFilter: WorldStatusFilter,
): HerdrOfficeProjection {
  const roster = projection.roster.filter(
    ({ agent }) =>
      statusFilter === "all" || agent.semanticStatus === statusFilter,
  );
  const agentKeys = new Set(roster.map(({ agent }) => agent.key));
  const rooms = projection.rooms
    .map((room) => ({
      ...room,
      visibleAgents: room.visibleAgents.filter((agent) => agentKeys.has(agent.key)),
      overflowCount: Math.max(
        0,
        roster.filter(
          ({ agent }) => agent.roomKey === room.key && agent.semanticStatus !== "done",
        ).length - room.visibleAgents.filter((agent) => agentKeys.has(agent.key)).length,
      ),
    }));
  const reviewAgents = projection.reviewAgents.filter((agent) => agentKeys.has(agent.key));
  const status = { working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 };
  for (const { agent } of roster) {
    status[agent.semanticStatus] += 1;
  }
  const receptionHosts = projection.hosts.filter(
    (host) => host.connectionState !== "disabled",
  );
  const omittedRooms = projection.roomRoster.filter((room) => !room.presented).length;
  const omittedReviewAgents = roster.filter(
    ({ agent, reviewPresented }) => agent.semanticStatus === "done" && !reviewPresented,
  ).length;
  const omittedDeskAgents = roster.filter(
    ({ agent, deskPresented }) => agent.semanticStatus !== "done" && !deskPresented,
  ).length;
  return {
    ...projection,
    rooms,
    roster,
    reviewAgents,
    unresolved: omittedRooms ? [{ kind: "room-bound", count: omittedRooms }] : [],
    coverage: {
      configuredHosts: projection.hosts.length,
      observedHosts: projection.hosts.filter((host) => host.observed).length,
      compatibleHosts: projection.hosts.filter((host) => host.compatibleWithWorld).length,
      connectingHosts: projection.hosts.filter(
        (host) => host.connectionState === "connecting",
      ).length,
      staleHosts: projection.hosts.filter((host) => host.stale).length,
      incompatibleHosts: projection.hosts.filter(
        (host) => host.connectionState === "incompatible",
      ).length,
      disabledHosts: projection.hosts.filter(
        (host) => host.connectionState === "disabled",
      ).length,
      observedWorkspaces: projection.roomRoster.length,
      observedAgents: roster.length,
      status,
      omittedRooms,
      omittedDeskAgents,
      omittedReceptionists: Math.max(
        0,
        receptionHosts.length - OFFICE_PRESENTATION_BOUNDS.hostReceptionists,
      ),
      omittedReviewAgents,
    },
    presentationBounds: {
      ...projection.presentationBounds,
      totalRooms: projection.roomRoster.length,
      renderedRooms: rooms.length,
      totalReceptionists: receptionHosts.length,
      renderedReceptionists: Math.min(
        receptionHosts.length,
        OFFICE_PRESENTATION_BOUNDS.hostReceptionists,
      ),
      totalReviewAgents: roster.filter(({ agent }) => agent.semanticStatus === "done").length,
      renderedReviewAgents: reviewAgents.length,
    },
  };
}

function statusLabel(status: Exclude<WorldStatusFilter, "all">) {
  if (status === "blocked") {
    return "Needs input";
  }
  if (status === "done") {
    return "At review";
  }
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function normalizeStatusFilter(value: string): WorldStatusFilter {
  return STATUS_FILTERS.includes(value as WorldStatusFilter)
    ? (value as WorldStatusFilter)
    : "all";
}

function isWorldSurfaceContext(value: unknown): value is WorldSurfaceContext {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<WorldSurfaceContext>;
  return (
    typeof record.onSelect === "function" &&
    typeof record.onHostFilter === "function" &&
    typeof record.onStatusFilter === "function" &&
    typeof record.onRosterPage === "function" &&
    typeof record.onBackToSidebar === "function" &&
    typeof record.onViewOffice === "function" &&
    typeof record.onToggleSidebar === "function" &&
    typeof record.onOpenInSpaces === "function" &&
    Boolean(record.projection)
  );
}
