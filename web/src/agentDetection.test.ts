import { describe, expect, it } from "vitest";
import { isAgentPane } from "./agentDetection";
import type { PaneInfo } from "./types";

const pane = (overrides: Partial<PaneInfo> = {}): PaneInfo => ({
  pane_id: "pane-1",
  terminal_id: "terminal-1",
  workspace_id: "workspace-1",
  tab_id: "tab-1",
  focused: false,
  agent_status: "unknown",
  revision: 1,
  ...overrides,
});

describe("shared Herdr agent pane detection", () => {
  it("detects every signal used by Spaces", () => {
    expect(isAgentPane(pane({ agent: "codex" }))).toBe(true);
    expect(isAgentPane(pane({ display_agent: "Codex" }))).toBe(true);
    expect(isAgentPane(pane({ title: "agent" }))).toBe(true);
    expect(isAgentPane(pane({ state_labels: { idle: "Waiting" } }))).toBe(true);
    expect(isAgentPane(pane({ agent_status: "idle" }))).toBe(true);
    expect(isAgentPane(pane())).toBe(false);
  });
});
