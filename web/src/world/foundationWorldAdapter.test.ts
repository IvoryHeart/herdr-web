import { describe, expect, it } from "vitest";
import type {
  SurfaceHostV1,
  SurfaceRuntimeFacts,
  SurfaceRuntimeIdentity,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import {
  foundationOfficeObservability,
  foundationPane,
  foundationRuntime,
  foundationWorldSources,
} from "./foundationWorldAdapter";
import {
  handoffFoundationOfficeToSpaces,
  handoffFoundationShellTargetToSpaces,
} from "./foundationWorldHandoff";

describe("Foundation World adapter", () => {
  it("keeps colliding native IDs qualified by bridge and generation", () => {
    const host = testHost([
      runtime("host-a", "generation-a"),
      runtime("host-b", "generation-b"),
    ]);

    const sources = foundationWorldSources(host);

    expect(sources.map(({ profile }) => profile.profileId)).toEqual(["host-a", "host-b"]);
    expect(sources.map(({ snapshot }) => snapshot?.panes[0]?.pane_id)).toEqual(["pane-1", "pane-1"]);
    expect(foundationPane(host, "host-a", "pane-1", "generation-a")?.terminalId).toBe("terminal-a");
    expect(foundationPane(host, "host-b", "pane-1", "generation-b")?.terminalId).toBe("terminal-b");
    expect(foundationPane(host, "host-a", "pane-1", "generation-b")).toBeNull();
  });

  it("rejects stale generations before World can resolve a runtime", () => {
    const host = testHost([runtime("host-a", "generation-new")]);

    expect(foundationRuntime(host, "host-a", "generation-old")).toBeNull();
    expect(foundationRuntime(host, "host-a", "generation-new")?.identity).toEqual({
      bridgeId: "host-a",
      connectionKey: "connection-host-a",
      generationKey: "generation-new",
    });
  });

  it("keeps extension transport independent during snapshot degradation", async () => {
    const runtimeIdentity = identity("host-a", "generation-a");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: Array<{ runtime: SurfaceRuntimeIdentity; operation: string }> = [];
    const host = testHost([runtime("host-a", "generation-a", "degraded")], async (request) => {
      requests.push({ runtime: request.runtime, operation: request.operation });
      await pending;
      return request.operation === "descriptor"
        ? descriptor()
        : { sequence: 0, envelopes: [] };
    });
    const controller = new AbortController();
    const result = foundationOfficeObservability(host, controller.signal);
    controller.abort();
    release();

    await expect(result).resolves.toMatchObject({ health: "degraded", failedSourceCount: 1 });
    expect(requests).toEqual([
      { runtime: runtimeIdentity, operation: "descriptor" },
      { runtime: runtimeIdentity, operation: "snapshot" },
    ]);
    expect(requests.every(({ runtime }) =>
      runtime.bridgeId === "host-a" &&
      runtime.connectionKey === "connection-host-a" &&
      runtime.generationKey === "generation-a",
    )).toBe(true);
  });

  it("selects the qualified runtime before focusing and navigating to Spaces", async () => {
    const events: string[] = [];
    const base = testHost([
      runtime("host-a", "generation-a"),
      runtime("host-b", "generation-b"),
    ]);
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: (selected) => events.push(`select:${selected.bridgeId}`),
      commands: {
        dispatch: async (command) => {
          if (command.type !== "focusPane") throw new Error("unexpected command");
          events.push(`focus:${command.target.identity.bridgeId}:${command.target.nativeTargetId}`);
          return { accepted: true, type: command.type, target: command.target };
        },
      },
      navigation: {
        ...base.navigation,
        goTo: (surfaceId) => events.push(`navigate:${surfaceId}`),
      },
    };

    await handoffFoundationOfficeToSpaces(host, {
      kind: "agent",
      key: "agent-b",
      profileId: "host-b",
      observedGeneration: "generation-b",
      currentPaneRef: { profileId: "host-b", kind: "pane", nativeTargetId: "pane-1" },
      terminalRef: { profileId: "host-b", kind: "terminal", nativeTargetId: "terminal-b" },
    });

    expect(events).toEqual([
      "select:host-b",
      "focus:host-b:pane-1",
      "navigate:spaces",
    ]);
  });

  it("re-resolves a stable terminal identity before selecting and focusing", async () => {
    const events: string[] = [];
    const base = testHost([runtime("host-b", "generation-b")]);
    const baseFacts = factsFor(identity("host-b", "generation-b"));
    const currentFacts: SurfaceRuntimeFacts = {
      ...baseFacts,
      panes: baseFacts.panes.map((pane) => ({ ...pane, paneId: "pane-current" })),
    };
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: (selected) => events.push(`select:${selected.bridgeId}`),
      facts: {
        forRuntime: () => currentFacts,
        subscribe: () => () => {},
      },
      commands: {
        dispatch: async (command) => {
          if (command.type !== "focusPane") throw new Error("unexpected command");
          events.push(`focus:${command.target.nativeTargetId}`);
          return { accepted: true, type: command.type, target: command.target };
        },
      },
      navigation: {
        ...base.navigation,
        goTo: (surfaceId) => events.push(`navigate:${surfaceId}`),
      },
    };

    await handoffFoundationOfficeToSpaces(host, {
      kind: "agent",
      key: "agent-b",
      profileId: "host-b",
      observedGeneration: "generation-b",
      currentPaneRef: { profileId: "host-b", kind: "pane", nativeTargetId: "pane-old" },
      terminalRef: { profileId: "host-b", kind: "terminal", nativeTargetId: "terminal-b" },
    });

    expect(events).toEqual([
      "select:host-b",
      "focus:pane-current",
      "navigate:spaces",
    ]);
  });

  it("preserves an exact shared-switcher tab through selection, focus, and navigation", async () => {
    const events: string[] = [];
    const base = testHost([runtime("host-b", "generation-b")]);
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: (selected) => events.push(`select:${selected.bridgeId}`),
      commands: {
        dispatch: async (command) => {
          if (command.type !== "focusTab") throw new Error("unexpected command");
          events.push(`focus-tab:${command.target.identity.bridgeId}:${command.target.nativeTargetId}`);
          return { accepted: true, type: command.type, target: command.target };
        },
      },
      navigation: {
        ...base.navigation,
        goTo: (surfaceId) => events.push(`navigate:${surfaceId}`),
      },
    };
    const target = {
      identity: identity("host-b", "generation-b"),
      kind: "tab" as const,
      nativeTargetId: "tab-1",
    };

    await handoffFoundationShellTargetToSpaces(host, target);

    expect(events).toEqual([
      "select:host-b",
      "focus-tab:host-b:tab-1",
      "navigate:spaces",
    ]);
  });

  it("rejects a disappeared workspace before selection, focus, or navigation", async () => {
    const events: string[] = [];
    const base = testHost([runtime("host-b", "generation-b")]);
    const currentFacts: SurfaceRuntimeFacts = {
      ...factsFor(identity("host-b", "generation-b")),
      workspaces: [],
    };
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: () => events.push("select"),
      facts: {
        forRuntime: () => currentFacts,
        subscribe: () => () => {},
      },
      commands: {
        dispatch: async (command) => {
          events.push("focus");
          return command.type === "focusWorkspace"
            ? { accepted: true, type: command.type, target: command.target }
            : Promise.reject(new Error("unexpected command"));
        },
      },
      navigation: { ...base.navigation, goTo: () => events.push("navigate") },
    };

    await expect(handoffFoundationOfficeToSpaces(host, {
      kind: "room",
      key: "room-b",
      profileId: "host-b",
      observedGeneration: "generation-b",
      workspaceRef: {
        profileId: "host-b",
        kind: "workspace",
        nativeTargetId: "workspace-1",
      },
    })).rejects.toThrow(/workspace is no longer present/iu);
    expect(events).toEqual([]);
  });

  it("rejects a stale handoff before selection, focus, or navigation", async () => {
    const events: string[] = [];
    const base = testHost([runtime("host-b", "generation-new")]);
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: () => events.push("select"),
      navigation: { ...base.navigation, goTo: () => events.push("navigate") },
      commands: {
        dispatch: async (command) => {
          events.push("focus");
          return command.type === "focusPane"
            ? { accepted: true, type: command.type, target: command.target }
            : Promise.reject(new Error("unexpected command"));
        },
      },
    };

    await expect(handoffFoundationOfficeToSpaces(host, {
      kind: "agent",
      key: "agent-b",
      profileId: "host-b",
      observedGeneration: "generation-old",
      currentPaneRef: { profileId: "host-b", kind: "pane", nativeTargetId: "pane-1" },
      terminalRef: { profileId: "host-b", kind: "terminal", nativeTargetId: "terminal-b" },
    })).rejects.toThrow(/reconnected/iu);
    expect(events).toEqual([]);
  });

  it("rejects a runtime without Spaces admission before any handoff mutation", async () => {
    const events: string[] = [];
    const missingTerminal = {
      ...runtime("host-b", "generation-b"),
      features: ["snapshot"],
    };
    const base = testHost([missingTerminal]);
    const host: SurfaceHostV1 = {
      ...base,
      selectRuntime: () => events.push("select"),
      navigation: { ...base.navigation, goTo: () => events.push("navigate") },
      commands: {
        dispatch: async (command) => {
          events.push("focus");
          return command.type === "focusPane"
            ? { accepted: true, type: command.type, target: command.target }
            : Promise.reject(new Error("unexpected command"));
        },
      },
    };

    await expect(handoffFoundationShellTargetToSpaces(host, {
      identity: missingTerminal.identity,
      kind: "pane",
      nativeTargetId: "pane-1",
    })).rejects.toThrow(/reconnected|full terminal/iu);
    expect(events).toEqual([]);
  });
});

function testHost(
  runtimes: SurfaceRuntimeView[],
  request: SurfaceHostV1["extensions"]["request"] = async () => descriptor(),
): SurfaceHostV1 {
  const facts = new Map(runtimes.map((item) => [item.identity.bridgeId, factsFor(item.identity)]));
  return {
    apiVersion: 1,
    signal: new AbortController().signal,
    runtimes,
    availableRuntimes: runtimes,
    selectedRuntime: runtimes[0] ?? null,
    selectRuntime: () => {},
    subscribeSelectedRuntime: () => () => {},
    navigation: {
      currentSurfaceId: "world",
      goTo: () => {},
      subscribe: () => () => {},
    },
    shell: {
      state: { runtimeScope: "all", compact: false, sidebarVisible: true },
      subscribe: () => () => {},
      subscribeInteractions: () => () => {},
      showSidebar: () => {},
      toggleSidebar: () => {},
    },
    facts: {
      forRuntime: (bridgeId) => facts.get(bridgeId) ?? null,
      subscribe: () => () => {},
    },
    capabilities: {
      forRuntime: () => null,
      admission: (requiredFeatures) => runtimes.map((item) => ({
        identity: item.identity,
        available: item.state === "ready" && requiredFeatures.every((feature) =>
          item.features.includes(feature),
        ),
        missingFeatures: requiredFeatures.filter((feature) => !item.features.includes(feature)),
        state: item.state,
      })),
      retry: () => {},
    },
    commands: { dispatch: async () => ({ accepted: true, type: "closePane", target: {
      identity: runtimes[0]?.identity ?? identity("none", "none"),
      kind: "pane",
      nativeTargetId: "pane-1",
    }}) },
    launchers: {
      list: async () => ({ presets: [], warnings: [] }),
      launchTab: async () => { throw new Error("unused"); },
      launchSplit: async () => { throw new Error("unused"); },
    },
    extensions: { request },
    terminals: { acquire: () => { throw new Error("unused"); } },
  };
}

function runtime(
  bridgeId: string,
  generationKey: string,
  state: SurfaceRuntimeView["state"] = "ready",
): SurfaceRuntimeView {
  return {
    identity: identity(bridgeId, generationKey),
    label: bridgeId,
    state,
    features: ["snapshot", "terminal_attach", "observability_extension"],
    commands: [
      "focusWorkspace",
      "focusTab",
      "focusPane",
      "createWorkspace",
      "renameWorkspace",
      "closeWorkspace",
      "createTab",
    ],
    launcherPresets: true,
  };
}

function identity(bridgeId: string, generationKey: string): SurfaceRuntimeIdentity {
  return {
    bridgeId,
    connectionKey: `connection-${bridgeId}`,
    generationKey,
  };
}

function factsFor(runtimeIdentity: SurfaceRuntimeIdentity): SurfaceRuntimeFacts {
  const terminalId = runtimeIdentity.bridgeId === "host-a" ? "terminal-a" : "terminal-b";
  return {
    identity: runtimeIdentity,
    workspaces: [{
      workspaceId: "workspace-1",
      number: 1,
      label: "Workspace",
      focused: true,
      paneCount: 1,
      tabCount: 1,
      activeTabId: "tab-1",
    }],
    tabs: [{
      tabId: "tab-1",
      workspaceId: "workspace-1",
      number: 1,
      label: "Tab",
      focused: true,
      paneCount: 1,
    }],
    panes: [{
      paneId: "pane-1",
      terminalId,
      workspaceId: "workspace-1",
      tabId: "tab-1",
      focused: true,
      label: "Pane",
      agent: "codex",
      displayAgent: "Codex",
      agentStatus: "working",
      taskSummary: null,
      stateLabels: { working: "Working" },
    }],
    activities: [],
    selection: null,
  };
}

function descriptor() {
  return {
    extension_id: "observability",
    contract_version: { major: 1, minor: 0 },
    provider_id: "none",
    capabilities: [],
    target_scopes: [],
    freshness: { mode: "unknown", max_age_ms: null },
    health: "unavailable",
    observed_at: 1,
  };
}
