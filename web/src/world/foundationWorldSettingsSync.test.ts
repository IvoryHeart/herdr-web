import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SurfaceHostV1,
  SurfaceRuntimeIdentity,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import {
  createFoundationWorldSettingsSyncState,
  synchronizeStoredFoundationWorldSettings,
} from "./foundationWorldSettingsSync";
import { writeWorldSettings } from "./worldSettingsState";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Foundation Office settings synchronization", () => {
  it("applies a stored bridge setting once per exact runtime generation", async () => {
    installStorage();
    writeWorldSettings("host-a", { prometheusUrl: "http://127.0.0.1:9101/" });
    const requests: Parameters<SurfaceHostV1["extensions"]["request"]>[0][] = [];
    const first = runtime("generation-a");
    const host = testHost(first, async (request) => {
      requests.push(request);
      return {};
    });
    const state = createFoundationWorldSettingsSyncState();

    await synchronizeStoredFoundationWorldSettings(host, [first], state);
    await synchronizeStoredFoundationWorldSettings(host, [first], state);
    const second = runtime("generation-b");
    await synchronizeStoredFoundationWorldSettings(host, [second], state);

    expect(requests).toEqual([
      {
        runtime: first.identity,
        extensionId: "observability",
        operation: "config-update",
        body: { prometheus_url: "http://127.0.0.1:9101/" },
      },
      {
        runtime: second.identity,
        extensionId: "observability",
        operation: "config-update",
        body: { prometheus_url: "http://127.0.0.1:9101/" },
      },
    ]);
  });

  it("retries a failed update and skips runtimes without admitted extension support", async () => {
    installStorage();
    writeWorldSettings("host-a", { prometheusUrl: null });
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});
    const admitted = runtime("generation-a");
    const host = testHost(admitted, request);
    const state = createFoundationWorldSettingsSyncState();

    await synchronizeStoredFoundationWorldSettings(host, [admitted], state);
    await synchronizeStoredFoundationWorldSettings(host, [admitted], state);
    await synchronizeStoredFoundationWorldSettings(
      host,
      [{ ...admitted, features: ["snapshot"] }],
      state,
    );

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("serializes changed settings so an older request cannot overwrite the latest value", async () => {
    installStorage();
    writeWorldSettings("host-a", { prometheusUrl: "http://127.0.0.1:9101/" });
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const values: Array<string | null> = [];
    const admitted = runtime("generation-a");
    const host = testHost(admitted, async (request) => {
      if (request.operation !== "config-update") throw new Error("unexpected extension request");
      values.push((request.body as { prometheus_url: string | null }).prometheus_url);
      if (values.length === 1) await firstPending;
      return {};
    });
    const state = createFoundationWorldSettingsSyncState();

    const first = synchronizeStoredFoundationWorldSettings(host, [admitted], state);
    await vi.waitFor(() => expect(values).toHaveLength(1));
    writeWorldSettings("host-a", { prometheusUrl: "http://127.0.0.1:9201/" });
    const second = synchronizeStoredFoundationWorldSettings(host, [admitted], state);
    await Promise.resolve();
    expect(values).toEqual(["http://127.0.0.1:9101/"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(values).toEqual([
      "http://127.0.0.1:9101/",
      "http://127.0.0.1:9201/",
    ]);
    expect(state.inFlight.size).toBe(0);
  });
});

function runtime(generationKey: string): SurfaceRuntimeView {
  return {
    identity: identity(generationKey),
    label: "Host A",
    state: "ready",
    features: ["snapshot", "observability_extension"],
    commands: [],
    launcherPresets: false,
  };
}

function identity(generationKey: string): SurfaceRuntimeIdentity {
  return {
    bridgeId: "host-a",
    connectionKey: "connection-a",
    generationKey,
  };
}

function testHost(
  current: SurfaceRuntimeView,
  request: SurfaceHostV1["extensions"]["request"],
): SurfaceHostV1 {
  return {
    apiVersion: 1,
    signal: new AbortController().signal,
    runtimes: [current],
    availableRuntimes: [current],
    selectedRuntime: current,
    selectRuntime: () => {},
    subscribeSelectedRuntime: () => () => {},
    navigation: { currentSurfaceId: "world", goTo: () => {}, subscribe: () => () => {} },
    shell: {
      state: { runtimeScope: "all", compact: false, sidebarVisible: true },
      subscribe: () => () => {},
      subscribeInteractions: () => () => {},
      showSidebar: () => {},
      toggleSidebar: () => {},
    },
    facts: { forRuntime: () => null, subscribe: () => () => {} },
    capabilities: { forRuntime: () => null, admission: () => [], retry: () => {} },
    commands: { dispatch: async () => { throw new Error("unused"); } },
    launchers: {
      list: async () => ({ presets: [], warnings: [] }),
      launchTab: async () => { throw new Error("unused"); },
      launchSplit: async () => { throw new Error("unused"); },
    },
    extensions: { request },
    terminals: { acquire: () => { throw new Error("unused"); } },
  };
}

function installStorage() {
  let value: string | null = null;
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  });
}
