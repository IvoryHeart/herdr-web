import { describe, expect, it } from "vitest";
import {
  CLIENT_NAVIGATION_PREFS_KEY,
  DEFAULT_NAVIGATION_SYNC_MODE,
  parseNavigationSyncMode,
  readClientNavigationPrefs,
  sharesNavigation,
  writeClientNavigationPrefs,
} from "./navigationPrefs";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: (key: string) => (key === CLIENT_NAVIGATION_PREFS_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === CLIENT_NAVIGATION_PREFS_KEY) {
        value = next;
      }
    },
  };
}

describe("client navigation preferences", () => {
  it("defaults navigation synchronization to shared", () => {
    expect(parseNavigationSyncMode(undefined)).toBe(DEFAULT_NAVIGATION_SYNC_MODE);
    expect(parseNavigationSyncMode("other")).toBe(DEFAULT_NAVIGATION_SYNC_MODE);
    expect(sharesNavigation(DEFAULT_NAVIGATION_SYNC_MODE)).toBe(true);
    expect(sharesNavigation("independent")).toBe(false);
  });

  it("round-trips per-client navigation state", () => {
    const storage = memoryStorage();
    const prefs = {
      mode: "independent" as const,
      selectedBridgeId: "bridge-a",
      selectedPane: { bridgeId: "bridge-a", paneId: "pane-a" },
      activeWorkspace: { bridgeId: "bridge-a", workspaceId: "workspace-a" },
      selectedPanesByBridgeId: { "bridge-a": "pane-a" },
      activeWorkspacesByBridgeId: { "bridge-a": "workspace-a" },
    };

    writeClientNavigationPrefs(prefs, storage);

    expect(readClientNavigationPrefs(storage)).toEqual(prefs);
  });

  it("drops malformed client selection data", () => {
    const storage = memoryStorage(
      JSON.stringify({
        mode: "independent",
        selectedBridgeId: 3,
        selectedPane: { bridgeId: "bridge-a" },
        activeWorkspace: "workspace-a",
        selectedPanesByBridgeId: { "bridge-a": "pane-a", invalid: 4 },
        activeWorkspacesByBridgeId: null,
      }),
    );

    expect(readClientNavigationPrefs(storage)).toEqual({
      mode: "independent",
      selectedBridgeId: null,
      selectedPane: null,
      activeWorkspace: null,
      selectedPanesByBridgeId: { "bridge-a": "pane-a" },
      activeWorkspacesByBridgeId: {},
    });
  });
});
