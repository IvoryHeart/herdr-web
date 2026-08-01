import { describe, expect, it } from "vitest";
import { hostConnectionState, RuntimeCache, runtimeControlsEnabled } from "./runtimeClient";
import type { BridgeRuntime } from "./bridge";

describe("runtime cache", () => {
  it("reconciles topology only from an admitted host snapshot", () => {
    const cache = new RuntimeCache<{ panes: string[] }>();
    cache.configure("host-a", "connection-a");
    expect(cache.admitSnapshot("host-a", "connection-a", { panes: ["p1"] }, 1)).toBe(true);
    expect(cache.admitSnapshot("host-a", "stale-connection", { panes: ["p2"] }, 2)).toBe(false);
    expect(cache.get("host-a")?.snapshot).toEqual({ panes: ["p1"] });

    expect(cache.admitSnapshot("host-a", "connection-a", { panes: [] }, 3)).toBe(true);
    expect(cache.get("host-a")?.snapshot).toEqual({ panes: [] });
  });

  it("isolates host failures and retains only explicitly stale presentation state", () => {
    const cache = new RuntimeCache<{ panes: string[] }>();
    cache.configure("host-a", "connection-a");
    cache.configure("host-b", "connection-b");
    cache.admitSnapshot("host-a", "connection-a", { panes: ["same-id"] }, 1);
    cache.admitSnapshot("host-b", "connection-b", { panes: ["same-id"] }, 1);

    cache.markUnavailable("host-b", "connection-b");

    expect(cache.get("host-a")).toMatchObject({ stale: false, snapshot: { panes: ["same-id"] } });
    expect(cache.get("host-b")).toMatchObject({ stale: true, snapshot: { panes: ["same-id"] } });
  });
});

describe("host connection state", () => {
  it("maps independent capability and snapshot outcomes to bounded states", () => {
    expect(hostConnectionState("probing", "loading", false)).toBe("connecting");
    expect(hostConnectionState("ready", "ready", true)).toBe("compatible");
    expect(hostConnectionState("ready", "error", true)).toBe("offline");
    expect(hostConnectionState("incompatible", "ready", false)).toBe("incompatible");
    expect(hostConnectionState("error", "error", true)).toBe("degraded");
  });

  it("enables controls only after a fresh compatible snapshot", () => {
    const runtime = readyRuntime();
    expect(runtimeControlsEnabled(runtime, "loading")).toBe(false);
    expect(runtimeControlsEnabled(runtime, "error")).toBe(false);
    expect(runtimeControlsEnabled(runtime, "ready")).toBe(true);
    expect(runtimeControlsEnabled({ ...runtime, capabilityState: "offline" }, "ready")).toBe(false);
  });
});

function readyRuntime(): BridgeRuntime {
  return {
    id: "host-a",
    mode: "configured",
    label: "Host A",
    color: "#89b4fa",
    backend: { id: "host-a", name: "Host A", baseUrl: "http://host-a.example:8787" },
    connectionKey: "connection-a",
    resumeToken: 0,
    capabilities: { bridge_api_version: 1, commands: [] },
    capabilityState: "ready",
    capabilityError: null,
    canConnect: true,
    httpUrl: (path) => path,
    wsUrl: (path) => path,
  };
}
