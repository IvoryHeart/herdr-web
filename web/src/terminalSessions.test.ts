import { describe, expect, it } from "vitest";
import type { BridgeRuntime } from "./bridge";
import { terminalSessionDescriptor } from "./terminalSessions";
import type { PaneInfo } from "./types";

describe("terminal-session boundary", () => {
  it("qualifies colliding terminal IDs by host profile and connection", () => {
    const pane = testPane("terminal-1");
    const hostA = terminalSessionDescriptor(runtime("host-a"), pane, "ready");
    const hostB = terminalSessionDescriptor(runtime("host-b"), pane, "ready");

    expect(hostA?.sessionKey).not.toBe(hostB?.sessionKey);
    expect(hostA?.attachEnabled).toBe(true);
    expect(hostA?.inputEnabled).toBe(true);
    expect(hostA?.resizeEnabled).toBe(true);
    expect(hostA?.scrollEnabled).toBe(true);
  });

  it("disables terminal input while a host is stale or unavailable", () => {
    expect(terminalSessionDescriptor(runtime("host-a"), testPane("terminal-1"), "error"))
      .toMatchObject({ inputEnabled: false });
  });

  it("changes the terminal session identity after a capability recovery generation", () => {
    const before = runtime("host-a");
    const after = {
      ...before,
      capabilityGeneration: 1,
      generationKey: `${before.connectionKey}:capability:1`,
    };
    expect(
      terminalSessionDescriptor(before, testPane("terminal-1"), "ready")?.sessionKey,
    ).not.toBe(
      terminalSessionDescriptor(after, testPane("terminal-1"), "ready")?.sessionKey,
    );
  });

  it("admits read-only attach while independently gating input, resize, scroll, and uploads", () => {
    const readOnly = runtime("host-a");
    readOnly.capabilities = {
      ...readOnly.capabilities,
      commands: readOnly.capabilities?.commands ?? [],
      features: ["snapshot", "terminal_attach"],
    };

    expect(terminalSessionDescriptor(readOnly, testPane("terminal-1"), "ready")).toMatchObject({
      attachEnabled: true,
      inputEnabled: false,
      resizeEnabled: false,
      scrollEnabled: false,
      uploadEnabled: false,
    });
  });
});

function runtime(id: string): BridgeRuntime {
  return {
    id,
    mode: "configured",
    label: id,
    color: "#89b4fa",
    backend: { id, name: id, baseUrl: `http://${id}.example:8787` },
    connectionKey: `configured:${id}`,
    capabilityGeneration: 0,
    generationKey: `configured:${id}:capability:0`,
    resumeToken: 0,
    capabilities: {
      bridge_api_version: 1,
      commands: [],
      features: [
        "snapshot",
        "terminal_attach",
        "terminal_input",
        "terminal_resize",
        "terminal_scroll",
        "uploads",
      ],
    },
    capabilityState: "ready",
    capabilityError: null,
    canConnect: true,
    httpUrl: (path) => path,
    wsUrl: (path) => path,
  };
}

function testPane(terminalId: string): PaneInfo {
  return {
    pane_id: "pane-1",
    terminal_id: terminalId,
    workspace_id: "workspace-1",
    tab_id: "tab-1",
    focused: true,
    agent_status: "working",
    revision: 1,
  };
}
