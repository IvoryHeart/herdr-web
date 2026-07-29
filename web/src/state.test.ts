import { describe, expect, it } from "vitest";
import {
  canClearTabName,
  canClearWorkspaceName,
  choosePaneForTab,
  choosePaneForWorkspace,
  chooseSelectedPane,
  chooseSelectedPaneForActiveWorkspace,
  displayTabLabel,
  paneListSubtitle,
  paneTitle,
  sortPanesForPicker,
} from "./state";
import type { PaneInfo, Snapshot, TabInfo, WorkspaceInfo } from "./types";

const pane = (pane_id: string, focused = false, agent_status: PaneInfo["agent_status"] = "idle") =>
  ({
    pane_id,
    terminal_id: `terminal-${pane_id}`,
    workspace_id: "1",
    tab_id: "1-1",
    focused,
    agent_status,
    revision: 1,
  }) satisfies PaneInfo;

const tab = (label: string, tab_id = "1-1") =>
  ({
    tab_id,
    workspace_id: "1",
    number: 1,
    label,
    focused: false,
    pane_count: 1,
    agent_status: "idle",
  }) satisfies TabInfo;

const workspace = (label: string) =>
  ({
    workspace_id: "1",
    number: 1,
    label,
    focused: true,
    pane_count: 1,
    tab_count: 1,
    active_tab_id: "1-1",
    agent_status: "idle",
  }) satisfies WorkspaceInfo;

const snapshot = (panes: PaneInfo[]): Snapshot => ({
  workspaces: [
    {
      workspace_id: "1",
      number: 1,
      label: "repo",
      focused: true,
      pane_count: panes.length,
      tab_count: 2,
      active_tab_id: "1-2",
      agent_status: "idle",
    },
  ],
  tabs: [
    {
      tab_id: "1-1",
      workspace_id: "1",
      number: 1,
      label: "main",
      focused: false,
      pane_count: 1,
      agent_status: "idle",
    },
    {
      tab_id: "1-2",
      workspace_id: "1",
      number: 2,
      label: "agents",
      focused: true,
      pane_count: 1,
      agent_status: "working",
    },
  ],
  panes,
  layouts: [],
});

describe("chooseSelectedPane", () => {
  it("keeps the current pane when it still exists", () => {
    expect(chooseSelectedPane(snapshot([pane("1-1"), pane("1-2", true)]), "1-1")).toBe("1-1");
  });

  it("keeps the current pane while the snapshot selection catches up", () => {
    expect(
      chooseSelectedPane(
        {
          ...snapshot([pane("1-1"), pane("1-2", true)]),
          selected_pane_id: "1-1",
        },
        "1-2",
      ),
    ).toBe("1-2");
  });

  it("uses the snapshot selection when there is no current pane", () => {
    expect(
      chooseSelectedPane(
        {
          ...snapshot([pane("1-1"), pane("1-2", true)]),
          selected_pane_id: "1-1",
        },
        null,
      ),
    ).toBe("1-1");
  });

  it("uses the snapshot selection when the current pane is gone", () => {
    expect(
      chooseSelectedPane(
        {
          ...snapshot([pane("1-1"), pane("1-2", true)]),
          selected_pane_id: "1-1",
        },
        "missing",
      ),
    ).toBe("1-1");
  });

  it("falls back to the focused pane", () => {
    expect(chooseSelectedPane(snapshot([pane("1-1"), pane("1-2", true)]), "missing")).toBe(
      "1-2",
    );
  });
});

describe("chooseSelectedPaneForActiveWorkspace", () => {
  it("keeps a selected pane that already belongs to the active workspace", () => {
    const data = multiWorkspaceSnapshot();

    expect(chooseSelectedPaneForActiveWorkspace(data, "2-1", "2")).toBe("2-1");
  });

  it("chooses from the active workspace instead of keeping a stale pane from another workspace", () => {
    const data = multiWorkspaceSnapshot();

    expect(chooseSelectedPaneForActiveWorkspace(data, "1-1", "2")).toBe("2-2");
  });

  it("falls back to normal pane selection when the active workspace is gone", () => {
    const data = multiWorkspaceSnapshot();

    expect(chooseSelectedPaneForActiveWorkspace(data, "1-1", "missing")).toBe("1-1");
  });
});

describe("projection selection helpers", () => {
  it("chooses a pane from the workspace active tab", () => {
    const data = snapshot([
      { ...pane("1-1"), tab_id: "1-1" },
      { ...pane("1-2"), tab_id: "1-2" },
    ]);

    expect(choosePaneForWorkspace(data, "1")).toBe("1-2");
  });

  it("chooses the focused pane within a tab", () => {
    const data = snapshot([
      { ...pane("1-2"), tab_id: "1-2" },
      { ...pane("1-3", true), tab_id: "1-2" },
    ]);

    expect(choosePaneForTab(data, "1-2")).toBe("1-3");
  });
});

function multiWorkspaceSnapshot(): Snapshot {
  return {
    workspaces: [
      {
        workspace_id: "1",
        number: 1,
        label: "one",
        focused: false,
        pane_count: 1,
        tab_count: 1,
        active_tab_id: "1-1",
        agent_status: "idle",
      },
      {
        workspace_id: "2",
        number: 2,
        label: "two",
        focused: true,
        pane_count: 2,
        tab_count: 2,
        active_tab_id: "2-2",
        agent_status: "idle",
      },
    ],
    tabs: [
      {
        tab_id: "1-1",
        workspace_id: "1",
        number: 1,
        label: "one",
        focused: false,
        pane_count: 1,
        agent_status: "idle",
      },
      {
        tab_id: "2-1",
        workspace_id: "2",
        number: 1,
        label: "two-a",
        focused: false,
        pane_count: 1,
        agent_status: "idle",
      },
      {
        tab_id: "2-2",
        workspace_id: "2",
        number: 2,
        label: "two-b",
        focused: true,
        pane_count: 1,
        agent_status: "idle",
      },
    ],
    panes: [
      { ...pane("1-1"), workspace_id: "1", tab_id: "1-1" },
      { ...pane("2-1"), workspace_id: "2", tab_id: "2-1" },
      { ...pane("2-2"), workspace_id: "2", tab_id: "2-2" },
    ],
    layouts: [],
  };
}

describe("sortPanesForPicker", () => {
  it("puts urgent agent states first", () => {
    expect(
      sortPanesForPicker([pane("1-1", false, "idle"), pane("1-2", false, "blocked")]).map(
        (item) => item.pane_id,
      ),
    ).toEqual(["1-2", "1-1"]);
  });
});

describe("paneTitle", () => {
  it("uses cwd basename before falling back to a generic terminal title", () => {
    expect(paneTitle({ ...pane("1-1"), foreground_cwd: "/home/kevin/worktrees/herdr" })).toBe(
      "herdr",
    );
    expect(paneTitle(pane("1-2"))).toBe("Terminal");
  });
});

describe("paneListSubtitle", () => {
  it("puts flat-list navigation context on the pane row", () => {
    expect(
      paneListSubtitle(
        {
          ...pane("1-1"),
          display_agent: "Codex",
          foreground_cwd: "/home/kevin/worktrees/herdr-web",
        },
        "development",
        "review",
        "srv",
      ),
    ).toBe("srv · development · review · herdr-web");
  });

  it("removes repeated title and context values", () => {
    expect(
      paneListSubtitle(
        {
          ...pane("1-1"),
          label: "Codex",
          display_agent: "Codex",
          foreground_cwd: "/home/kevin/Codex",
        },
        "workspace",
        "Codex",
        "workspace",
      ),
    ).toBe("workspace");
  });
});

describe("displayTabLabel", () => {
  it("uses the single pane title for default numeric tab labels", () => {
    expect(displayTabLabel(tab("1"), [{ ...pane("1-1"), label: "Codex" }])).toBe("Codex");
  });

  it("keeps explicit tab labels", () => {
    expect(displayTabLabel(tab("review"), [{ ...pane("1-1"), label: "Codex" }])).toBe("review");
  });

  it("keeps numeric tab labels when a tab has multiple panes", () => {
    expect(
      displayTabLabel(tab("2"), [
        { ...pane("1-1"), label: "Codex" },
        { ...pane("1-2"), tab_id: "1-1", label: "Claude" },
      ]),
    ).toBe("2");
  });
});

describe("rename clear heuristics", () => {
  it("treats numeric tab labels as already default", () => {
    expect(canClearTabName(tab("1"))).toBe(false);
    expect(canClearTabName(tab("review"))).toBe(true);
  });

  it("uses bridge-provided tab clearability when available", () => {
    expect(canClearTabName({ ...tab("review"), can_clear_name: false })).toBe(false);
  });

  it("treats cwd-derived workspace labels as already default", () => {
    const panes = [{ ...pane("1-1"), cwd: "/home/kevin/worktrees/herdr-web" }];

    expect(canClearWorkspaceName(workspace("herdr-web"), panes)).toBe(false);
    expect(canClearWorkspaceName(workspace("Herdr Web"), panes)).toBe(true);
  });

  it("uses bridge-provided workspace clearability when cwd heuristics would differ", () => {
    const panes = [{ ...pane("1-1"), cwd: "/home/kevin/worktrees/herdr-web/web/src" }];

    expect(canClearWorkspaceName({ ...workspace("herdr-web"), can_clear_name: false }, panes)).toBe(
      false,
    );
  });
});
