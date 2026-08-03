import { describe, expect, it } from "vitest";
import { hostProfile } from "../hostProfile";
import type { AgentStatus, PaneInfo, Snapshot, WorkspaceInfo } from "../types";
import {
  OFFICE_PRESENTATION_BOUNDS,
  projectHerdrOffice,
} from "./herdrOfficeProjection";
import type { HerdrOfficeSourceHost } from "./herdrOfficeProjection";

describe("Herdr Office projection", () => {
  it("projects only detected Herdr panes with truthful semantic status and bounded labels", () => {
    const source = liveHost("profile-a", 0, snapshot(
      [workspace("workspace-a", 1, "Alpha")],
      [
        pane("working", "terminal-working", "pane-working", "workspace-a", "working", {
          display_agent: "Codex",
          state_labels: { working: "Reviewing", idle: "Pretend working" },
        }),
        pane("idle", "terminal-idle", "pane-idle", "workspace-a", "idle", {
          agent: "claude",
          state_labels: { working: "This must not change status" },
        }),
        pane("blocked", "terminal-blocked", "pane-blocked", "workspace-a", "blocked", {
          agent: "pi",
        }),
        pane("done", "terminal-done", "pane-done", "workspace-a", "done", {
          agent: "grok",
        }),
        pane("unknown", "terminal-unknown", "pane-unknown", "workspace-a", "unknown", {
          title: "Agent process",
        }),
        pane("shell", "terminal-shell", "pane-shell", "workspace-a", "unknown"),
      ],
    ));

    const projection = projectHerdrOffice([source], 42);

    expect(projection.generatedAt).toBe(42);
    expect(projection.coverage.observedAgents).toBe(5);
    expect(projection.coverage.status).toEqual({
      working: 1,
      idle: 1,
      blocked: 1,
      done: 1,
      unknown: 1,
    });
    expect(projection.roster.find(({ agent }) => agent.displayLabel === "claude")?.agent)
      .toMatchObject({ semanticStatus: "idle", stateLabels: { working: "This must not change status" } });
    expect(projection.roster.find(({ agent }) => agent.semanticStatus === "unknown")?.agent.displayLabel)
      .toBe("Agent");
    expect(projection.reviewAgents).toHaveLength(1);
    expect(projection.rooms[0].visibleAgents.every((agent) => agent.semanticStatus !== "done"))
      .toBe(true);
  });

  it("keeps colliding native values distinct through profile-qualified tuple keys", () => {
    const sources = ["profile-a", "profile-b"].map((profileId, index) =>
      liveHost(profileId, index, snapshot(
        [workspace("same-workspace", 1, "main")],
        [pane("same", "same-terminal", "same-pane", "same-workspace", "working", {
          display_agent: "Same agent",
        })],
      ), "Duplicate host"),
    );

    const projection = projectHerdrOffice(sources, 1);

    expect(new Set(projection.hosts.map((host) => host.key)).size).toBe(2);
    expect(new Set(projection.rooms.map((room) => room.key)).size).toBe(2);
    expect(new Set(projection.roster.map(({ agent }) => agent.key)).size).toBe(2);
    expect(new Set(projection.roster.map(({ agent }) => agent.currentPaneRef.profileId)).size).toBe(2);
  });

  it("keeps stable terminal identity and character choice while current pane navigation moves", () => {
    const first = projectHerdrOffice([
      liveHost("profile-a", 0, snapshot(
        [workspace("workspace-a", 1, "Alpha")],
        [pane("agent", "terminal-stable", "pane-old", "workspace-a", "working", { agent: "codex" })],
      )),
    ], 1).roster[0].agent;
    const moved = projectHerdrOffice([
      liveHost("profile-a", 0, snapshot(
        [workspace("workspace-a", 1, "Alpha")],
        [pane("agent", "terminal-stable", "pane-new", "workspace-a", "working", { agent: "codex" })],
      )),
    ], 2).roster[0].agent;

    expect(moved.key).toBe(first.key);
    expect(moved.characterIndex).toBe(first.characterIndex);
    expect(moved.currentPaneRef.nativeTargetId).toBe("pane-new");
    expect(moved.currentPaneRef.nativeTargetId).not.toBe(first.currentPaneRef.nativeTargetId);
  });

  it("orders hosts, rooms, and desk agents deterministically", () => {
    const projection = projectHerdrOffice([
      liveHost("profile-z", 0, snapshot(
        [workspace("workspace-2", 2, "Later"), workspace("workspace-1", 1, "Earlier")],
        [
          pane("z", "terminal-z", "pane-z", "workspace-1", "idle", { agent: "z" }),
          pane("a", "terminal-a", "pane-a", "workspace-1", "idle", { agent: "a" }),
        ],
      )),
      liveHost("profile-a", 0, snapshot([workspace("workspace-a", 1, "Tie")], [])),
    ], 1);

    expect(projection.hosts.map((host) => host.key)).toEqual(["profile-a", "profile-z"]);
    expect(projection.rooms.map((room) => room.displayLabel)).toEqual(["Tie", "Earlier", "Later"]);
    expect(projection.rooms[1].visibleAgents.map((agent) => agent.currentTerminalRef.nativeTargetId))
      .toEqual(["terminal-a", "terminal-z"]);
  });

  it("marks retained hosts stale and disables every exact handoff without changing status", () => {
    const source = liveHost("profile-a", 0, snapshot(
      [workspace("workspace-a", 1, "Alpha")],
      [pane("agent", "terminal-a", "pane-a", "workspace-a", "working", { agent: "codex" })],
    ));
    source.connectionState = "offline";

    const projection = projectHerdrOffice([source], 1);

    expect(projection.hosts[0]).toMatchObject({ stale: true, connectionState: "offline" });
    expect(projection.rooms[0].stale).toBe(true);
    expect(projection.roster[0].agent).toMatchObject({
      stale: true,
      canOpenInSpaces: false,
      semanticStatus: "working",
    });
  });

  it("allows snapshot-only hosts in World while reporting Spaces handoff incompatibility", () => {
    const source = liveHost("profile-a", 0, snapshot(
      [workspace("workspace-a", 1, "Alpha")],
      [pane("agent", "terminal-a", "pane-a", "workspace-a", "idle", { agent: "codex" })],
    ));
    source.features = ["snapshot"];

    const projection = projectHerdrOffice([source], 1);

    expect(projection.hosts[0]).toMatchObject({
      compatibleWithWorld: true,
      compatibleWithSpaces: false,
    });
    expect(projection.roster[0].agent.canOpenInSpaces).toBe(false);
  });

  it("enforces every presentation bound while retaining the complete deterministic roster", () => {
    const sources = Array.from({ length: 7 }, (_, hostIndex) => {
      const workspaces = Array.from(
        { length: hostIndex === 0 ? 123 : 1 },
        (_, workspaceIndex) => workspace(
          `workspace-${hostIndex}-${workspaceIndex}`,
          workspaceIndex,
          `Workspace ${hostIndex}-${workspaceIndex}`,
        ),
      );
      const panes: PaneInfo[] = [];
      if (hostIndex === 0) {
        for (let index = 0; index < 6; index += 1) {
          panes.push(pane(
            `desk-${index}`,
            `terminal-desk-${index}`,
            `pane-desk-${index}`,
            "workspace-0-0",
            "working",
            { agent: `desk-${index}` },
          ));
        }
        for (let index = 0; index < 10; index += 1) {
          panes.push(pane(
            `done-${index}`,
            `terminal-done-${index}`,
            `pane-done-${index}`,
            "workspace-0-0",
            "done",
            { agent: `done-${index}` },
          ));
        }
      }
      return liveHost(`profile-${hostIndex}`, hostIndex, snapshot(workspaces, panes));
    });

    const projection = projectHerdrOffice(sources, 1);

    expect(projection.presentationBounds).toMatchObject({
      renderedRooms: OFFICE_PRESENTATION_BOUNDS.rooms,
      totalRooms: 129,
      renderedReceptionists: OFFICE_PRESENTATION_BOUNDS.hostReceptionists,
      totalReceptionists: 7,
      renderedReviewAgents: OFFICE_PRESENTATION_BOUNDS.reviewAgents,
      totalReviewAgents: 10,
      rosterPage: 50,
    });
    expect(projection.rooms).toHaveLength(128);
    expect(projection.roomRoster).toHaveLength(129);
    expect(projection.rooms[0].visibleAgents).toHaveLength(4);
    expect(projection.rooms[0].overflowCount).toBe(2);
    expect(projection.reviewAgents).toHaveLength(8);
    expect(projection.roster).toHaveLength(16);
    expect(projection.coverage).toMatchObject({
      omittedRooms: 1,
      omittedDeskAgents: 2,
      omittedReceptionists: 1,
      omittedReviewAgents: 2,
    });
  });

  it("keeps empty workspaces visible and disabled hosts structural-only", () => {
    const disabled = liveHost("disabled", 0, snapshot(
      [workspace("hidden", 1, "Hidden")],
      [],
    ));
    disabled.profile = { ...disabled.profile, enabled: false };
    disabled.connectionState = "disabled";
    const live = liveHost("live", 1, snapshot(
      [workspace("empty", 1, "Empty workspace")],
      [],
    ));

    const projection = projectHerdrOffice([disabled, live], 1);

    expect(projection.hosts).toHaveLength(2);
    expect(projection.rooms.map((room) => room.displayLabel)).toEqual(["Empty workspace"]);
    expect(projection.rooms[0]).toMatchObject({ observedAgentCount: 0, overflowCount: 0 });
    expect(projection.coverage.disabledHosts).toBe(1);
  });
});

function liveHost(
  profileId: string,
  displayOrder: number,
  value: Snapshot,
  label = `Host ${profileId}`,
): HerdrOfficeSourceHost {
  return {
    profile: hostProfile(profileId, label, `http://${profileId}.example`, true, displayOrder),
    connectionState: "compatible",
    generationKey: `${profileId}:generation-1`,
    features: ["snapshot", "terminal_attach"],
    snapshot: value,
  };
}

function snapshot(workspaces: WorkspaceInfo[], panes: PaneInfo[]): Snapshot {
  return {
    workspaces,
    tabs: workspaces.map((value) => ({
      tab_id: `tab-${value.workspace_id}`,
      workspace_id: value.workspace_id,
      number: 1,
      label: "Tab",
      focused: value.focused,
      pane_count: panes.filter((paneValue) => paneValue.workspace_id === value.workspace_id).length,
      agent_status: "unknown",
    })),
    panes,
    layouts: [],
  };
}

function workspace(id: string, number: number, label: string): WorkspaceInfo {
  return {
    workspace_id: id,
    number,
    label,
    focused: number === 1,
    pane_count: 0,
    tab_count: 1,
    active_tab_id: `tab-${id}`,
    agent_status: "unknown",
  };
}

function pane(
  _name: string,
  terminalId: string,
  paneId: string,
  workspaceId: string,
  status: AgentStatus,
  overrides: Partial<PaneInfo> = {},
): PaneInfo {
  return {
    pane_id: paneId,
    terminal_id: terminalId,
    workspace_id: workspaceId,
    tab_id: `tab-${workspaceId}`,
    focused: false,
    agent_status: status,
    revision: 1,
    ...overrides,
  };
}
