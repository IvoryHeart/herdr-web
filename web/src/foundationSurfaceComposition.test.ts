import { describe, expect, it, vi } from "vitest";
import {
  FOUNDATION_SURFACE_API_VERSION,
  createProductAssembly,
  createSettingsLifecycle,
  createSurfaceLifecycle,
  defineProductSettings,
  defineSurface,
  createSurfaceHostV1,
  SharedTerminalHandlePool,
  settleCleanups,
  withAcquisitionGuard,
} from "@herdr-world/foundation/surfaces";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";

function host(): Omit<SurfaceHostV1, "signal"> {
  return {
    runtimes: () => [],
    subscribe: () => () => {},
    retry: () => {},
    dispatch: async () => ({}),
    navigate: () => {},
    acquireTerminal: async () => ({
      key: "bridge-a:terminal-a",
      target: { bridgeId: "bridge-a", kind: "terminal", nativeTargetId: "terminal-a" },
      attach: () => {},
      input: () => {},
      resize: () => {},
      scroll: () => {},
      focus: () => {},
      detach: () => {},
      release: () => {},
    }),
  };
}

function registration(overrides: Partial<Parameters<typeof defineSurface>[0]> = {}) {
  return defineSurface({
    definition: {
      id: "spaces",
      label: "Spaces",
      route: "/",
      semanticIcon: "terminal-workspaces",
      requiredBridgeFeatures: ["snapshot"],
    },
    createContext: () => ({ token: Symbol("context") }),
    load: async () => ({ default: () => null }),
    dispose: async () => {},
    ...overrides,
  });
}

describe("Foundation surface contract", () => {
  it("rejects incompatible versions, duplicate IDs/routes, and unsupported features", () => {
    const one = registration();
    expect(() => createProductAssembly({ surfaceApiVersion: 2, surfaces: [one] })).toThrow(
      /expected 1/iu,
    );
    expect(() => createProductAssembly({ surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION, surfaces: [one, one] })).toThrow(
      /duplicate surface ID/iu,
    );
    const other = defineSurface({
      definition: { ...one.definition, id: "office" },
      createContext: () => null,
      load: async () => ({ default: () => null }),
      dispose: () => {},
    });
    expect(() => createProductAssembly({ surfaceApiVersion: 1, surfaces: [one, other] })).toThrow(
      /duplicate surface route/iu,
    );
    const invalidFeature = {
      definition: {
        id: "spaces",
        label: "Spaces",
        route: "/",
        semanticIcon: "spaces",
        requiredBridgeFeatures: ["not-a-feature"],
      },
      createContext: () => null,
      load: async () => ({ default: () => null }),
      dispose: () => {},
    } as never;
    expect(() => defineSurface(invalidFeature)).toThrow();
  });

  it("loads before creating context, creates once per generation, and disposes once", async () => {
    const events: string[] = [];
    const context = { generation: 1 };
    const surface = defineSurface({
      definition: {
        id: "spaces",
        label: "Spaces",
        route: "/",
        semanticIcon: "terminal-workspaces",
        requiredBridgeFeatures: [],
      },
      load: async () => {
        events.push("load");
        return { default: () => null };
      },
      createContext: (currentHost) => {
        expect(currentHost.signal.aborted).toBe(false);
        events.push("context");
        return context;
      },
      dispose: async (value) => {
        expect(value).toBe(context);
        events.push("dispose");
      },
    });
    const lifecycle = createSurfaceLifecycle(surface, { host: host() });
    await lifecycle.open();
    await lifecycle.close();
    await lifecycle.close();
    expect(events).toEqual(["load", "context", "dispose"]);
  });

  it("does not dispose a failed load or a factory that never returned", async () => {
    const dispose = vi.fn();
    const loadFailure = defineSurface({
      definition: { id: "spaces", label: "Spaces", route: "/", semanticIcon: "spaces", requiredBridgeFeatures: [] },
      load: async () => { throw new Error("load failed"); },
      createContext: () => null,
      dispose,
    });
    const failedLoad = createSurfaceLifecycle(loadFailure, { host: host() });
    await failedLoad.open();
    await failedLoad.close();
    expect(dispose).not.toHaveBeenCalled();

    const failedFactory = defineSurface({
      definition: { id: "spaces", label: "Spaces", route: "/", semanticIcon: "spaces", requiredBridgeFeatures: [] },
      load: async () => ({ default: () => null }),
      createContext: () => { throw new Error("factory failed"); },
      dispose,
    });
    const failedContext = createSurfaceLifecycle(failedFactory, { host: host() });
    await failedContext.open();
    await failedContext.close();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("ignores a stale lazy result and does not create its context", async () => {
    let resolveLoad!: (value: { default: (props: { context: unknown }) => unknown }) => void;
    const createContext = vi.fn(() => ({}));
    const surface = defineSurface({
      definition: { id: "spaces", label: "Spaces", route: "/", semanticIcon: "spaces", requiredBridgeFeatures: [] },
      load: () => new Promise<{ default: (props: { context: unknown }) => unknown }>((resolve) => {
        resolveLoad = resolve;
      }),
      createContext,
      dispose: () => {},
    });
    const lifecycle = createSurfaceLifecycle(surface, { host: host() });
    const opening = lifecycle.open();
    await lifecycle.close();
    resolveLoad({ default: () => null });
    await opening;
    expect(createContext).not.toHaveBeenCalled();
  });

  it("awaits delayed cleanup before replacement and contains a rejecting disposer", async () => {
    let release!: () => void;
    const cleanupFinished = new Promise<void>((resolve) => { release = resolve; });
    const events: string[] = [];
    let count = 0;
    const surface = defineSurface({
      definition: { id: "spaces", label: "Spaces", route: "/", semanticIcon: "spaces", requiredBridgeFeatures: [] },
      load: async () => ({ default: () => null }),
      createContext: () => ({ generation: ++count }),
      dispose: async (context) => {
        events.push(`dispose:${context.generation}`);
        if (context.generation === 1) {
          await cleanupFinished;
          events.push("cleanup");
          throw new Error("tracked cleanup failed");
        }
      },
    });
    const lifecycle = createSurfaceLifecycle(surface, {
      host: host(),
      onError: (error) => events.push(`reported:${(error as Error).message}`),
    });
    await lifecycle.open();
    const replacement = lifecycle.replace();
    await Promise.resolve();
    expect(events).toEqual(["dispose:1"]);
    release();
    await replacement;
    expect(events).toEqual([
      "dispose:1",
      "cleanup",
      "reported:tracked cleanup failed",
    ]);
    expect(lifecycle.snapshot.status).toBe("ready");
    expect(count).toBe(2);
  });

  it("applies identical lifecycle rules to product settings", async () => {
    const events: string[] = [];
    const contribution = defineProductSettings({
      id: "world-settings",
      label: "World settings",
      createContext: () => {
        events.push("context");
        return { value: 1 };
      },
      load: async () => {
        events.push("load");
        return { default: () => null };
      },
      dispose: async () => { events.push("dispose"); },
    });
    const lifecycle = createSettingsLifecycle(contribution, { host: host() });
    await lifecycle.open();
    await lifecycle.retry();
    await lifecycle.dispose();
    expect(events).toEqual(["load", "context", "dispose", "load", "context", "dispose"]);
  });

  it("provides strong-exception-safety helpers for partial factories and all-settled cleanup", async () => {
    const released: string[] = [];
    await expect(withAcquisitionGuard(async (addCleanup) => {
      addCleanup(() => { released.push("first"); });
      addCleanup(async () => { released.push("second"); });
      throw new Error("partial");
    })).rejects.toThrow("partial");
    expect(released).toEqual(["second", "first"]);

    const cleanup = vi.fn(() => { throw new Error("one cleanup"); });
    await expect(settleCleanups([cleanup, () => { released.push("last"); }])).rejects.toThrow(
      "one cleanup",
    );
    expect(released.at(-1)).toBe("last");
  });

  it("validates qualified identities, allow-listed commands, and host-managed terminals", async () => {
    const dispatch = vi.fn(async () => ({}));
    const acquireTerminal = vi.fn(async () => ({
      key: "bridge-b:terminal-1",
      target: { bridgeId: "bridge-b", kind: "terminal" as const, nativeTargetId: "terminal-1" },
      attach: () => {}, input: () => {}, resize: () => {}, scroll: () => {},
      focus: () => {}, detach: () => {}, release: () => {},
    }));
    const controller = new AbortController();
    const wrapped = createSurfaceHostV1({ ...host(), dispatch, acquireTerminal }, controller.signal);
    await wrapped.dispatch({
      command: "pane.focus_direction",
      target: { bridgeId: "bridge-b", kind: "pane", nativeTargetId: "1" },
    });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      target: { bridgeId: "bridge-b", kind: "pane", nativeTargetId: "1" },
    }));
    await expect(wrapped.dispatch({
      command: "server.stop" as never,
      target: { bridgeId: "bridge-b", kind: "pane", nativeTargetId: "1" },
    })).rejects.toThrow(/allow-listed/iu);
    await wrapped.acquireTerminal({
      bridgeId: "bridge-b",
      kind: "terminal",
      nativeTargetId: "terminal-1",
    });
    expect(acquireTerminal).toHaveBeenCalledWith({
      bridgeId: "bridge-b",
      kind: "terminal",
      nativeTargetId: "terminal-1",
    });
    await expect(wrapped.acquireTerminal({
      bridgeId: "bridge-b",
      kind: "pane",
      nativeTargetId: "1",
    })).rejects.toThrow(/terminal target/iu);
  });

  it("shares a terminal owner and releases only the view handles", async () => {
    const pool = new SharedTerminalHandlePool();
    const release = vi.fn();
    const factory = vi.fn(async () => ({
      key: "bridge-a:terminal-a",
      target: { bridgeId: "bridge-a", kind: "terminal" as const, nativeTargetId: "terminal-a" },
      attach: () => {}, input: () => {}, resize: () => {}, scroll: () => {},
      focus: () => {}, detach: () => {}, release,
    }));
    const target = { bridgeId: "bridge-a", kind: "terminal" as const, nativeTargetId: "terminal-a" };
    const first = await pool.acquire(target, factory);
    const second = await pool.acquire(target, factory);
    expect(factory).toHaveBeenCalledTimes(1);
    await first.release();
    await first.release();
    expect(release).not.toHaveBeenCalled();
    expect(pool.size).toBe(1);
    await second.release();
    expect(release).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(0);
  });
});
