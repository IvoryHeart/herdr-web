import { describe, expect, it } from "vitest";
import type { BridgeRuntime } from "./bridge";
import {
  qualifyRuntimeTarget,
  qualifiedRuntimeKey,
  routeQualifiedTarget,
  RuntimeRouteError,
} from "./runtimeIdentity";

describe("qualified runtime identity", () => {
  it("keeps colliding native IDs distinct across host profiles", () => {
    const hostA = qualifyRuntimeTarget("host-a", "pane", "p1");
    const hostB = qualifyRuntimeTarget("host-b", "pane", "p1");

    expect(qualifiedRuntimeKey(hostA)).not.toBe(qualifiedRuntimeKey(hostB));
    expect(new Set([qualifiedRuntimeKey(hostA), qualifiedRuntimeKey(hostB)]).size).toBe(2);
  });

  it("does not collide when identifiers contain separators", () => {
    const first = qualifyRuntimeTarget("host:a", "pane", "p1");
    const second = qualifyRuntimeTarget("host", "pane", "a:p1");

    expect(qualifiedRuntimeKey(first)).not.toBe(qualifiedRuntimeKey(second));
  });

  it("routes only through the owning compatible host and its command allowlist", () => {
    const runtimes = [runtime("host-a"), runtime("host-b")];
    const target = qualifyRuntimeTarget("host-b", "pane", "p1");

    expect(routeQualifiedTarget(target, runtimes, "pane.close").id).toBe("host-b");
    expect(() => routeQualifiedTarget(target, runtimes, "server.stop")).toThrow(
      expect.objectContaining<Partial<RuntimeRouteError>>({ reason: "unsupported_command" }),
    );
  });

  it("never falls back to another host when the owner is offline", () => {
    const runtimes = [runtime("host-a"), runtime("host-b", false)];
    const target = qualifyRuntimeTarget("host-b", "terminal", "terminal-1");

    expect(() => routeQualifiedTarget(target, runtimes)).toThrow(
      expect.objectContaining<Partial<RuntimeRouteError>>({ reason: "host_unavailable" }),
    );
  });
});

function runtime(id: string, ready = true): BridgeRuntime {
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
    capabilities: { commands: ["pane.close"], bridge_api_version: 1 },
    capabilityState: ready ? "ready" : "error",
    capabilityError: ready ? null : "offline",
    canConnect: ready,
    httpUrl: (path) => `http://${id}.example:8787${path}`,
    wsUrl: (path) => `ws://${id}.example:8787${path}`,
  };
}
