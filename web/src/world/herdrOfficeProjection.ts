import { isAgentPane } from "../agentDetection";
import type { HostProfile } from "../hostProfile";
import type { HostConnectionState } from "../runtimeClient";
import { qualifiedRuntimeKey, qualifyRuntimeTarget } from "../runtimeIdentity";
import type { QualifiedTarget } from "../runtimeIdentity";
import type { AgentStatus, PaneInfo, Snapshot, WorkspaceInfo } from "../types";

export const OFFICE_PRESENTATION_BOUNDS = Object.freeze({
  rooms: 128,
  deskAgentsPerRoom: 4,
  hostReceptionists: 6,
  reviewAgents: 8,
  rosterPage: 50,
});

const CHARACTER_COUNT = 12;
const HOST_THEME_COUNT = 6;
const MAX_VISIBLE_LABEL = 80;
const MAX_STATE_LABEL = 96;

export type HerdrOfficeSourceHost = {
  profile: HostProfile;
  connectionState: HostConnectionState;
  generationKey: string | null;
  features: readonly string[];
  snapshot: Snapshot | null;
};

export type OfficeHostSkin = {
  themeIndex: number;
  badge: string;
};

export type OfficeHost = {
  key: string;
  displayLabel: string;
  displayOrder: number;
  connectionState: HostConnectionState;
  observed: boolean;
  stale: boolean;
  compatibleWithWorld: boolean;
  compatibleWithSpaces: boolean;
  deterministicSkin: OfficeHostSkin;
};

export type OfficeRoom = {
  key: string;
  hostKey: string;
  workspaceRef: QualifiedTarget;
  observedGeneration: string;
  displayLabel: string;
  order: number;
  stale: boolean;
  canOpenInSpaces: boolean;
  visibleAgents: OfficeAgent[];
  overflowCount: number;
  observedAgentCount: number;
};

export type OfficeAgent = {
  key: string;
  currentPaneRef: QualifiedTarget;
  currentTerminalRef: QualifiedTarget;
  observedGeneration: string;
  roomKey: string;
  hostKey: string;
  displayLabel: string;
  semanticStatus: AgentStatus;
  stateLabels: Partial<Record<AgentStatus, string>>;
  stale: boolean;
  canOpenInSpaces: boolean;
  characterIndex: number;
};

export type OfficeRosterEntry = {
  agent: OfficeAgent;
  roomKey: string;
  roomLabel: string;
  hostKey: string;
  hostLabel: string;
  roomPresented: boolean;
  deskPresented: boolean;
  reviewPresented: boolean;
};

export type OfficeRoomRosterEntry = {
  key: string;
  hostKey: string;
  hostLabel: string;
  workspaceRef: QualifiedTarget;
  observedGeneration: string;
  displayLabel: string;
  order: number;
  stale: boolean;
  canOpenInSpaces: boolean;
  presented: boolean;
};

export type OfficeCoverage = {
  configuredHosts: number;
  observedHosts: number;
  compatibleHosts: number;
  connectingHosts: number;
  staleHosts: number;
  incompatibleHosts: number;
  disabledHosts: number;
  observedWorkspaces: number;
  observedAgents: number;
  status: Record<AgentStatus, number>;
  omittedRooms: number;
  omittedDeskAgents: number;
  omittedReceptionists: number;
  omittedReviewAgents: number;
};

export type OfficePresentationBounds = typeof OFFICE_PRESENTATION_BOUNDS & {
  totalRooms: number;
  renderedRooms: number;
  totalReceptionists: number;
  renderedReceptionists: number;
  totalReviewAgents: number;
  renderedReviewAgents: number;
};

export type OfficeUnresolved = {
  kind: "room-bound";
  count: number;
};

export type HerdrOfficeProjection = {
  version: 1;
  generatedAt: number;
  hosts: OfficeHost[];
  rooms: OfficeRoom[];
  reviewAgents: OfficeAgent[];
  roomRoster: OfficeRoomRosterEntry[];
  roster: OfficeRosterEntry[];
  unresolved: OfficeUnresolved[];
  coverage: OfficeCoverage;
  presentationBounds: OfficePresentationBounds;
};

type ProjectedHost = {
  source: HerdrOfficeSourceHost;
  host: OfficeHost;
};

type ProjectedRoom = {
  sourceHost: HerdrOfficeSourceHost;
  host: OfficeHost;
  workspace: WorkspaceInfo;
  room: Omit<OfficeRoom, "visibleAgents" | "overflowCount" | "observedAgentCount">;
  agents: OfficeAgent[];
};

export function projectHerdrOffice(
  sources: readonly HerdrOfficeSourceHost[],
  generatedAt: number,
): HerdrOfficeProjection {
  const projectedHosts = [...sources]
    .sort(compareSourceHosts)
    .map(projectHost);
  const allRooms = projectedHosts.flatMap(projectRooms).sort(compareProjectedRooms);
  const presentedRoomKeys = new Set(
    allRooms.slice(0, OFFICE_PRESENTATION_BOUNDS.rooms).map((entry) => entry.room.key),
  );
  const allAgents = allRooms.flatMap((entry) => entry.agents);
  const doneAgents = allRooms.flatMap((entry) =>
    entry.agents
      .filter((agent) => agent.semanticStatus === "done")
      .map((agent) => ({ agent, room: entry })),
  );
  const presentedReviewKeys = new Set(
    doneAgents
      .slice(0, OFFICE_PRESENTATION_BOUNDS.reviewAgents)
      .map(({ agent }) => agent.key),
  );

  const rooms = allRooms
    .slice(0, OFFICE_PRESENTATION_BOUNDS.rooms)
    .map((entry) => {
      const deskAgents = entry.agents.filter((agent) => agent.semanticStatus !== "done");
      return {
        ...entry.room,
        visibleAgents: deskAgents.slice(0, OFFICE_PRESENTATION_BOUNDS.deskAgentsPerRoom),
        overflowCount: Math.max(
          0,
          deskAgents.length - OFFICE_PRESENTATION_BOUNDS.deskAgentsPerRoom,
        ),
        observedAgentCount: entry.agents.length,
      };
    });
  const presentedDeskKeys = new Set(
    rooms.flatMap((room) => room.visibleAgents.map((agent) => agent.key)),
  );
  const reviewAgents = doneAgents
    .slice(0, OFFICE_PRESENTATION_BOUNDS.reviewAgents)
    .map(({ agent }) => agent);
  const roomRoster = allRooms.map((entry) => ({
    key: entry.room.key,
    hostKey: entry.host.key,
    hostLabel: entry.host.displayLabel,
    workspaceRef: entry.room.workspaceRef,
    observedGeneration: entry.room.observedGeneration,
    displayLabel: entry.room.displayLabel,
    order: entry.room.order,
    stale: entry.room.stale,
    canOpenInSpaces: entry.room.canOpenInSpaces,
    presented: presentedRoomKeys.has(entry.room.key),
  }));
  const roster = allRooms.flatMap((entry) =>
    entry.agents.map((agent) => ({
      agent,
      roomKey: entry.room.key,
      roomLabel: entry.room.displayLabel,
      hostKey: entry.host.key,
      hostLabel: entry.host.displayLabel,
      roomPresented: presentedRoomKeys.has(entry.room.key),
      deskPresented: presentedDeskKeys.has(agent.key),
      reviewPresented: presentedReviewKeys.has(agent.key),
    })),
  );
  const omittedRooms = Math.max(0, allRooms.length - OFFICE_PRESENTATION_BOUNDS.rooms);
  const omittedDeskAgents = allRooms.reduce((count, entry) => {
    if (!presentedRoomKeys.has(entry.room.key)) {
      return count + entry.agents.filter((agent) => agent.semanticStatus !== "done").length;
    }
    return (
      count +
      Math.max(
        0,
        entry.agents.filter((agent) => agent.semanticStatus !== "done").length -
          OFFICE_PRESENTATION_BOUNDS.deskAgentsPerRoom,
      )
    );
  }, 0);
  const enabledHosts = projectedHosts.filter(({ source }) => source.profile.enabled);
  const staleHosts = projectedHosts.filter(({ host }) => host.stale).length;

  return {
    version: 1,
    generatedAt,
    hosts: projectedHosts.map(({ host }) => host),
    rooms,
    reviewAgents,
    roomRoster,
    roster,
    unresolved: omittedRooms ? [{ kind: "room-bound", count: omittedRooms }] : [],
    coverage: {
      configuredHosts: projectedHosts.length,
      observedHosts: projectedHosts.filter(({ source }) => source.snapshot !== null).length,
      compatibleHosts: projectedHosts.filter(({ host }) => host.compatibleWithWorld).length,
      connectingHosts: projectedHosts.filter(
        ({ source }) => source.connectionState === "connecting",
      ).length,
      staleHosts,
      incompatibleHosts: projectedHosts.filter(
        ({ source }) => source.connectionState === "incompatible",
      ).length,
      disabledHosts: projectedHosts.filter(({ source }) => !source.profile.enabled).length,
      observedWorkspaces: allRooms.length,
      observedAgents: allAgents.length,
      status: countStatuses(allAgents),
      omittedRooms,
      omittedDeskAgents,
      omittedReceptionists: Math.max(
        0,
        enabledHosts.length - OFFICE_PRESENTATION_BOUNDS.hostReceptionists,
      ),
      omittedReviewAgents: Math.max(
        0,
        doneAgents.length - OFFICE_PRESENTATION_BOUNDS.reviewAgents,
      ),
    },
    presentationBounds: {
      ...OFFICE_PRESENTATION_BOUNDS,
      totalRooms: allRooms.length,
      renderedRooms: rooms.length,
      totalReceptionists: enabledHosts.length,
      renderedReceptionists: Math.min(
        enabledHosts.length,
        OFFICE_PRESENTATION_BOUNDS.hostReceptionists,
      ),
      totalReviewAgents: doneAgents.length,
      renderedReviewAgents: reviewAgents.length,
    },
  };
}

function projectHost(source: HerdrOfficeSourceHost): ProjectedHost {
  const featureSet = new Set(source.features);
  const enabled = source.profile.enabled;
  const incompatible = source.connectionState === "incompatible";
  const compatibleWithWorld = enabled && !incompatible && featureSet.has("snapshot");
  const compatibleWithSpaces =
    compatibleWithWorld && featureSet.has("terminal_attach");
  const stale =
    source.snapshot !== null &&
    source.connectionState !== "compatible";
  const seed = stableNumber(source.profile.profileId);
  return {
    source,
    host: {
      key: source.profile.profileId,
      displayLabel: boundedLabel(source.profile.label, "Host"),
      displayOrder: source.profile.displayOrder,
      connectionState: enabled ? source.connectionState : "disabled",
      observed: source.snapshot !== null,
      stale,
      compatibleWithWorld,
      compatibleWithSpaces,
      deterministicSkin: {
        themeIndex: seed % HOST_THEME_COUNT,
        badge: `HOST ${String(source.profile.displayOrder + 1).padStart(2, "0")}`,
      },
    },
  };
}

function projectRooms({ source, host }: ProjectedHost): ProjectedRoom[] {
  if (!source.profile.enabled || !source.snapshot) {
    return [];
  }
  const panesByWorkspace = new Map<string, PaneInfo[]>();
  for (const pane of source.snapshot.panes) {
    const panes = panesByWorkspace.get(pane.workspace_id) ?? [];
    panes.push(pane);
    panesByWorkspace.set(pane.workspace_id, panes);
  }
  return source.snapshot.workspaces.map((workspace) => {
    const workspaceRef = qualifyRuntimeTarget(
      source.profile.profileId,
      "workspace",
      workspace.workspace_id,
    );
    const roomKey = qualifiedRuntimeKey(workspaceRef);
    const canOpenInSpaces =
      host.compatibleWithSpaces &&
      !host.stale &&
      source.connectionState === "compatible" &&
      Boolean(source.generationKey);
    const agents = (panesByWorkspace.get(workspace.workspace_id) ?? [])
      .filter(isAgentPane)
      .map((pane) => projectAgent(source, host, roomKey, pane, canOpenInSpaces))
      .sort(compareOfficeAgents);
    return {
      sourceHost: source,
      host,
      workspace,
      room: {
        key: roomKey,
        hostKey: host.key,
        workspaceRef,
        observedGeneration: source.generationKey ?? "",
        displayLabel: boundedLabel(workspace.label, "Workspace"),
        order: workspace.number,
        stale: host.stale,
        canOpenInSpaces,
      },
      agents,
    };
  });
}

function projectAgent(
  source: HerdrOfficeSourceHost,
  host: OfficeHost,
  roomKey: string,
  pane: PaneInfo,
  canOpenInSpaces: boolean,
): OfficeAgent {
  const terminalRef = qualifyRuntimeTarget(
    source.profile.profileId,
    "terminal",
    pane.terminal_id,
  );
  const key = qualifiedRuntimeKey(terminalRef);
  return {
    key,
    currentPaneRef: qualifyRuntimeTarget(source.profile.profileId, "pane", pane.pane_id),
    currentTerminalRef: terminalRef,
    observedGeneration: source.generationKey ?? "",
    roomKey,
    hostKey: host.key,
    displayLabel: boundedLabel(pane.display_agent || pane.agent, "Agent"),
    semanticStatus: pane.agent_status,
    stateLabels: boundedStateLabels(pane.state_labels),
    stale: host.stale,
    canOpenInSpaces,
    characterIndex: stableNumber(key) % CHARACTER_COUNT,
  };
}

function compareSourceHosts(left: HerdrOfficeSourceHost, right: HerdrOfficeSourceHost) {
  return (
    left.profile.displayOrder - right.profile.displayOrder ||
    left.profile.profileId.localeCompare(right.profile.profileId)
  );
}

function compareProjectedRooms(left: ProjectedRoom, right: ProjectedRoom) {
  return (
    left.host.displayOrder - right.host.displayOrder ||
    left.host.key.localeCompare(right.host.key) ||
    left.workspace.number - right.workspace.number ||
    left.room.key.localeCompare(right.room.key)
  );
}

function compareOfficeAgents(left: OfficeAgent, right: OfficeAgent) {
  return left.key.localeCompare(right.key);
}

function countStatuses(agents: readonly OfficeAgent[]): Record<AgentStatus, number> {
  const counts: Record<AgentStatus, number> = {
    working: 0,
    idle: 0,
    blocked: 0,
    done: 0,
    unknown: 0,
  };
  for (const agent of agents) {
    counts[agent.semanticStatus] += 1;
  }
  return counts;
}

function boundedStateLabels(
  labels: Record<string, string> | undefined,
): Partial<Record<AgentStatus, string>> {
  const result: Partial<Record<AgentStatus, string>> = {};
  for (const status of ["working", "idle", "blocked", "done", "unknown"] as const) {
    const label = labels?.[status];
    if (label) {
      result[status] = boundedLabel(label, status, MAX_STATE_LABEL);
    }
  }
  return result;
}

function boundedLabel(value: string | null | undefined, fallback: string, limit = MAX_VISIBLE_LABEL) {
  const normalized = value?.trim() || fallback;
  const points = [...normalized];
  if (points.length <= limit) {
    return normalized;
  }
  return `${points.slice(0, Math.max(1, limit - 1)).join("")}…`;
}

export function stableNumber(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
