import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commands,
  createCommands,
  createdPaneId,
} from "./commands";
import { fallbackLaunchSpec } from "./launch";

describe("command helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds created pane ids from supported response shapes", () => {
    expect(createdPaneId({ pane_id: "top" })).toBe("top");
    expect(createdPaneId({ root_pane: { pane_id: "root" } })).toBe("root");
    expect(createdPaneId({ pane: { pane_id: "pane" } })).toBe("pane");
    expect(createdPaneId({ agent: { pane_id: "agent" } })).toBe("agent");
    expect(createdPaneId({ move_result: { pane: { pane_id: "moved" } } })).toBe("moved");
    expect(createdPaneId({})).toBeNull();
  });

  it("uses injected bridge URLs for commands", async () => {
    const httpUrl = (path: string) => `http://192.168.1.20:4000${path}`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "ok" }), {
        status: 200,
      }),
    );

    await createCommands(httpUrl).closePane("pane-1");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://192.168.1.20:4000/api/command",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates launch tabs without a tab label and renames the root pane", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (body.method === "tab.create") {
        return new Response(JSON.stringify({ root_pane: { pane_id: "pane-1" } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    await commands.createLaunchTab("space-1", { ...fallbackLaunchSpec("shell"), title: "Review" });

    expect(requests).toEqual([
      { method: "tab.create", params: { workspace_id: "space-1", focus: true } },
      { method: "pane.rename", params: { pane_id: "pane-1", label: "Review" } },
    ]);
  });

  it("clears workspace and tab names with null labels", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    await commands.renameWorkspace("space-1", null);
    await commands.renameTab("tab-1", null);

    expect(requests).toEqual([
      { method: "workspace.rename", params: { workspace_id: "space-1", label: null } },
      { method: "tab.rename", params: { tab_id: "tab-1", label: null } },
    ]);
  });

  it("launches presets through the bridge-owned launch endpoint", async () => {
    const requests: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ input, body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          preset_id: "remote-codex",
          title: "Remote Codex",
          workspace_id: "space-1",
          tab_id: "tab-1",
          pane_id: "pane-1",
        }),
        { status: 200 },
      );
    });

    await commands.launchPresetSplit("pane-0", "tab-0", "right", {
      presetId: "remote-codex",
      label: "Remote Codex",
      title: "Remote Codex",
    });

    expect(requests).toEqual([
      {
        input: "/api/launcher-presets/launch",
        body: {
          preset_id: "remote-codex",
          title: "Remote Codex",
          target: {
            mode: "split",
            target_pane_id: "pane-0",
            tab_id: "tab-0",
            direction: "right",
          },
        },
      },
    ]);
  });
});
