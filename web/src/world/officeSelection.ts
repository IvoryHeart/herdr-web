import type {
  HerdrOfficeProjection,
  OfficeAgent,
  OfficeDeskRosterEntry,
  OfficeHost,
  OfficeRoomRosterEntry,
  OfficeRosterEntry,
} from "./herdrOfficeProjection";

export type OfficeSelection =
  | {
      kind: "agent";
      agent: OfficeAgent;
      entry: OfficeRosterEntry;
    }
  | {
      kind: "desk";
      desk: OfficeDeskRosterEntry;
    }
  | {
      kind: "room";
      room: OfficeRoomRosterEntry;
    }
  | {
      kind: "host";
      host: OfficeHost;
  };

export type OfficeSeatAvailabilityReason = "host" | "workspace" | "capability" | null;

export function officeSeatAvailability(
  hasSelectedHost: boolean,
  hasActiveWorkspace: boolean,
  canCreateTab: boolean,
) {
  if (!hasSelectedHost) {
    return { supported: false, reason: "host" as const };
  }
  if (!hasActiveWorkspace) {
    return { supported: false, reason: "workspace" as const };
  }
  if (!canCreateTab) {
    return { supported: false, reason: "capability" as const };
  }
  return { supported: true, reason: null as OfficeSeatAvailabilityReason };
}

export function findOfficeSelection(
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
): OfficeSelection | null {
  if (!selectedKey) {
    return null;
  }
  const agent = projection.roster.find(({ agent: entry }) => entry.key === selectedKey);
  if (agent) {
    return { kind: "agent", agent: agent.agent, entry: agent };
  }
  const desk = projection.deskRoster.find(({ desk: entry }) => entry.key === selectedKey);
  if (desk) {
    return { kind: "desk", desk };
  }
  const room = projection.roomRoster.find((entry) => entry.key === selectedKey);
  if (room) {
    return { kind: "room", room };
  }
  const host = projection.hosts.find((entry) => entry.key === selectedKey);
  return host ? { kind: "host", host } : null;
}

export function formatOfficeActivityAge(timestamp: number | undefined, now = Date.now()) {
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return null;
  }
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 1_000) {
    return "just now";
  }
  if (elapsed < 60_000) {
    return `${Math.floor(elapsed / 1_000)}s ago`;
  }
  if (elapsed < 3_600_000) {
    return `${Math.floor(elapsed / 60_000)}m ago`;
  }
  if (elapsed < 86_400_000) {
    return `${Math.floor(elapsed / 3_600_000)}h ago`;
  }
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}
