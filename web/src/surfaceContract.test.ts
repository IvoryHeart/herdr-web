// @vitest-environment jsdom

import { act, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOUNDATION_SURFACE_API_VERSION,
  ProductSettingsContribution,
  SurfaceHostV1,
  SurfaceCommand,
  SurfaceRegistration,
  SurfaceRuntimeView,
  assertFoundationSurfaceApiVersion,
  createProductAssembly,
  createSurfaceHostV1,
  defineProductSettingsContribution,
  defineSurface,
  validateProductAssembly,
  validateSurfaceDefinition,
} from "./surfaceContract";
import { LifecycleKernel } from "./surfaceLifecycle";
import type { BridgeRuntime } from "./bridge";
import { terminalSessionOwners } from "./terminalSessionOwner";

type AlphaContext = { kind: "alpha"; value: number };
type BetaContext = { kind: "beta"; value: string };

const noopCommandOwner = {
  dispatch: async (command: SurfaceCommand, runtime: SurfaceRuntimeView, signal: AbortSignal) => {
    void command;
    void runtime;
    void signal;
    throw new Error("unused command owner");
  },
};

afterEach(() => {
  terminalSessionOwners.disposeAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Spec 011 public surface contract", () => {
  it("accepts the exact API version and rejects mismatch with expected/observed diagnostics", () => {
    expect(FOUNDATION_SURFACE_API_VERSION).toBe(1);
    expect(() => assertFoundationSurfaceApiVersion(1)).not.toThrow();
    expect(() => assertFoundationSurfaceApiVersion(2)).toThrow(
      /expected 1, observed 2.*range negotiation is not supported/iu,
    );
    expect(() => assertFoundationSurfaceApiVersion(undefined)).toThrow(
      /expected 1, observed missing/iu,
    );
  });

  it("rejects malformed definitions and validates required bridge feature names", () => {
    const valid = {
      id: "spaces",
      label: "Spaces",
      route: "/",
      semanticIcon: "terminal-workspaces",
      requiredBridgeFeatures: ["snapshot", "terminal_attach"],
    };
    expect(validateSurfaceDefinition(valid)).toEqual(valid);
    expect(() => validateSurfaceDefinition({ ...valid, id: "Spaces SDK" })).toThrow(/invalid.*ID/iu);
    expect(() => validateSurfaceDefinition({ ...valid, route: "world" })).toThrow(/invalid.*route/iu);
    expect(() =>
      validateSurfaceDefinition({ ...valid, requiredBridgeFeatures: ["terminal attach"] }),
    ).toThrow(/invalid.*feature/iu);
    expect(() =>
      validateSurfaceDefinition({ ...valid, requiredBridgeFeatures: ["snapshot", "snapshot"] }),
    ).toThrow(/duplicate.*feature/iu);
  });

  it("rejects duplicate IDs and routes before an assembly can mount", () => {
    const spaces = defineSurface(surfaceRegistration("spaces", "/", 1));
    const duplicateId = defineSurface(surfaceRegistration("spaces", "/world", 2));
    const duplicateRoute = defineSurface(surfaceRegistration("office", "/", 3));

    expect(() =>
      validateProductAssembly({
        surfaceApiVersion: 1,
        surfaces: [spaces, duplicateId],
      }),
    ).toThrow(/duplicate surface ID/iu);
    expect(() =>
      createProductAssembly({
        surfaceApiVersion: 1,
        surfaces: [spaces, duplicateRoute],
      }),
    ).toThrow(/duplicate surface route.*spaces.*office/iu);
  });

  it("keeps a validated initial Spaces route and Office route", () => {
    const assembly = createProductAssembly({
      surfaceApiVersion: 1,
      surfaces: [
        defineSurface(surfaceRegistration("spaces", "/", 1)),
        defineSurface(surfaceRegistration("office", "/world", 2)),
      ],
    });
    expect(assembly.surfaces.map(({ definition }) => [definition.id, definition.route])).toEqual([
      ["spaces", "/"],
      ["office", "/world"],
    ]);
  });

  it("keeps registration and settings generics bound at compile time", () => {
    const alpha = surfaceRegistration<AlphaContext>("alpha", "/alpha", {
      kind: "alpha",
      value: 1,
    });
    const beta = surfaceRegistration<BetaContext>("beta", "/beta", {
      kind: "beta",
      value: "text",
    });
    const alphaSettings = settingsContribution<AlphaContext>("alpha-settings", {
      kind: "alpha",
      value: 1,
    });
    const betaSettings = settingsContribution<BetaContext>("beta-settings", {
      kind: "beta",
      value: "text",
    });

    // @ts-expect-error A Beta context cannot be substituted for Alpha.
    const mismatchedSurface: SurfaceRegistration<AlphaContext> = beta;
    // @ts-expect-error A Beta settings context cannot be substituted for Alpha.
    const mismatchedSettings: ProductSettingsContribution<AlphaContext> = betaSettings;
    void alpha;
    void alphaSettings;
    void mismatchedSurface;
    void mismatchedSettings;
  });

  it("exposes only semantic commands and qualified capabilities through SurfaceHostV1", async () => {
    const commandOwner = {
      dispatch: vi.fn(async (command, runtime, signal) => {
        expect(command.type).toBe("focusPane");
        expect(runtime.identity.bridgeId).toBe("bridge-a");
        expect(signal.aborted).toBe(false);
        return { accepted: true as const, target: command.target };
      }),
    };
    const host = createSurfaceHostV1({
      signal: new AbortController().signal,
      runtimes: [
        { runtime: runtime("bridge-a", "generation-a", ["snapshot", "terminal_attach"]), wsUrl },
        { runtime: runtime("bridge-b", "generation-b", ["snapshot"]), wsUrl },
      ],
      navigation: {
        currentSurfaceId: "spaces",
        goTo: vi.fn(),
        subscribe: () => () => {},
      },
      commandOwner,
    });

    const admission = host.capabilities.admission(["terminal_attach"]);
    expect(admission.map((entry) => [entry.identity.bridgeId, entry.available])).toEqual([
      ["bridge-a", true],
      ["bridge-b", false],
    ]);
    const target = {
      identity: host.runtimes[0].identity,
      kind: "pane" as const,
      nativeTargetId: "pane-1",
    };
    await host.commands.dispatch({ type: "focusPane", target });
    expect(commandOwner.dispatch).toHaveBeenCalledOnce();
  });

  it("uses the merged terminal owner for narrow handles and keeps bridge/generation identities qualified", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const host = createSurfaceHostV1({
      signal: new AbortController().signal,
      runtimes: [
        { runtime: runtime("bridge-a", "generation-a", ["terminal_attach"]), wsUrl },
        { runtime: runtime("bridge-b", "generation-a", ["terminal_attach"]), wsUrl },
      ],
      navigation: {
        currentSurfaceId: "spaces",
        goTo: () => {},
        subscribe: () => () => {},
      },
      commandOwner: noopCommandOwner,
    });
    const options = {
      outputCoalesceMs: 0,
      initialSize: { cols: 80, rows: 24 },
      inputEnabled: true,
      resizeEnabled: true,
      scrollEnabled: true,
      focusOwner: true,
      onOutput: () => {},
      onState: () => {},
      onConnectAttempt: () => {},
    };
    const terminalA = host.terminals.acquire(
      { identity: host.runtimes[0].identity, kind: "terminal", nativeTargetId: "terminal-1" },
      options,
    );
    const terminalB = host.terminals.acquire(
      { identity: host.runtimes[1].identity, kind: "terminal", nativeTargetId: "terminal-1" },
      options,
    );
    expect(Object.keys(terminalA)).not.toContain("socket");
    expect(Object.keys(terminalA)).toEqual(
      expect.arrayContaining([
        "updateAdmission",
        "setFocusOwner",
        "reportSize",
        "sendInput",
        "sendScroll",
        "requestReconnect",
        "release",
      ]),
    );
    terminalA.release();
    terminalB.release();
  });
});

describe("typed surface lifecycle kernel", () => {
  it("does not create or dispose context after a lazy load rejects", async () => {
    const dispose = vi.fn();
    const createContext = vi.fn(() => ({ kind: "alpha" as const, value: 1 }));
    const errors: string[] = [];
    const kernel = new LifecycleKernel(
      {
        createContext,
        load: async () => {
          throw new Error("lazy load failed");
        },
        dispose,
      },
      lifecycleOptions(errors),
    );

    const result = await kernel.mount();
    expect(result.status).toBe("failed");
    expect(createContext).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(errors).toEqual(["load"]);
  });

  it("leaves partial factory cleanup to the factory and never disposes an invalid value", async () => {
    let acquired = 0;
    const dispose = vi.fn();
    const kernel = new LifecycleKernel(
      {
        createContext: () => {
          acquired += 1;
          try {
            throw new Error("factory failed");
          } finally {
            acquired -= 1;
          }
        },
        load: async () => ({ default: () => null }),
        dispose,
      },
      lifecycleOptions(),
    );

    const result = await kernel.mount();
    expect(result.status).toBe("failed");
    expect(acquired).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("aborts navigation before lazy load resolves and ignores the stale result", async () => {
    const load = deferred<{ default: SurfaceComponentForTest }>();
    const loadStarted = deferred<void>();
    const createContext = vi.fn(() => ({ kind: "alpha" as const, value: 1 }));
    const dispose = vi.fn();
    const signals: AbortSignal[] = [];
    const kernel = new LifecycleKernel(
      {
        createContext,
        load: () => {
          loadStarted.resolve();
          return load.promise;
        },
        dispose,
      },
      {
        createHost: (signal) => {
          signals.push(signal);
          return testHost(signal);
        },
      },
    );

    const pending = kernel.mount();
    await loadStarted.promise;
    await kernel.close("navigation");
    load.resolve({ default: () => null });
    expect((await pending).status).toBe("stale");
    expect(createContext).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });

  it("disposes exactly once and waits for delayed cleanup before retry replacement", async () => {
    const cleanup = deferred<void>();
    let nextContext = 0;
    const createContext = vi.fn(() => ({ kind: "alpha" as const, value: ++nextContext }));
    const dispose = vi.fn(() => cleanup.promise);
    const loads: Array<() => void> = [];
    const firstLoadStarted = deferred<void>();
    const kernel = new LifecycleKernel(
      {
        createContext,
        load: () =>
          new Promise<{ default: SurfaceComponentForTest }>((resolve) => {
            loads.push(() => resolve({ default: () => null }));
            if (loads.length === 1) {
              firstLoadStarted.resolve();
            }
          }),
        dispose,
      },
      lifecycleOptions(),
    );

    const firstMount = kernel.mount();
    await firstLoadStarted.promise;
    loads.shift()?.();
    expect((await firstMount).status).toBe("mounted");
    const replacement = kernel.retry();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(createContext).toHaveBeenCalledOnce();
    expect(loads).toHaveLength(0);
    cleanup.resolve();
    await vi.waitFor(() => expect(loads).toHaveLength(1));
    expect(loads).toHaveLength(1);
    loads.shift()?.();
    expect((await replacement).status).toBe("mounted");
    await kernel.close("assembly-teardown");
    await kernel.close("assembly-teardown");
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("ignores an old generation after replacement and gives the replacement a fresh signal", async () => {
    const firstLoad = deferred<{ default: SurfaceComponentForTest }>();
    const secondLoad = deferred<{ default: SurfaceComponentForTest }>();
    const loadStarted = deferred<void>();
    const secondLoadStarted = deferred<void>();
    const signals: AbortSignal[] = [];
    let loadCount = 0;
    const createContext = vi.fn(() => ({ kind: "alpha" as const, value: loadCount }));
    const kernel = new LifecycleKernel(
      {
        createContext,
        load: () => {
          loadCount += 1;
          if (loadCount === 1) {
            loadStarted.resolve();
            return firstLoad.promise;
          }
          secondLoadStarted.resolve();
          return secondLoad.promise;
        },
        dispose: () => {},
      },
      {
        createHost: (signal) => {
          signals.push(signal);
          return testHost(signal);
        },
      },
    );

    const oldAttempt = kernel.mount();
    await loadStarted.promise;
    const replacement = kernel.retry();
    await secondLoadStarted.promise;
    firstLoad.resolve({ default: () => null });
    expect((await oldAttempt).status).toBe("stale");
    expect(signals[0].aborted).toBe(true);
    expect(signals[1]).not.toBe(signals[0]);
    secondLoad.resolve({ default: () => null });
    expect((await replacement).status).toBe("mounted");
    expect(createContext).toHaveBeenCalledOnce();
  });

  it("reports a rejecting disposer only after tracked resources are released", async () => {
    const resources = new Set(["subscription", "timer"]);
    const reported: unknown[] = [];
    const kernel = new LifecycleKernel(
      {
        createContext: () => ({ kind: "alpha" as const, value: 1 }),
        load: async () => ({ default: () => null }),
        dispose: () => {
          resources.clear();
          throw new Error("cleanup report");
        },
      },
      {
        ...lifecycleOptions(),
        onError: (error, info) => {
          expect(resources.size).toBe(0);
          reported.push([error, info.kind]);
        },
      },
    );
    expect((await kernel.mount()).status).toBe("mounted");
    await expect(kernel.close("admission-loss")).resolves.toBeUndefined();
    expect(resources.size).toBe(0);
    expect(reported).toHaveLength(1);
    expect((reported[0] as [unknown, string])[1]).toBe("dispose");
  });

  it("keeps unrelated surface lifecycles independent", async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const first = new LifecycleKernel(
      registrationWithContext("a", disposeA),
      lifecycleOptions(),
    );
    const second = new LifecycleKernel(
      registrationWithContext("b", disposeB),
      lifecycleOptions(),
    );
    expect((await first.mount()).status).toBe("mounted");
    expect((await second.mount()).status).toBe("mounted");
    await first.close("navigation");
    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).not.toHaveBeenCalled();
    await second.close("assembly-teardown");
    expect(disposeB).toHaveBeenCalledOnce();
  });

  it("contains render failures locally and supports retry after settlement", async () => {
    const dispose = vi.fn();
    const errors: string[] = [];
    const kernel = new LifecycleKernel(
      registrationWithContext("render", dispose),
      lifecycleOptions(errors),
    );
    const mounted = await kernel.mount();
    expect(mounted.status).toBe("mounted");
    if (mounted.status !== "mounted") {
      return;
    }
    await kernel.reportRenderFailure(mounted.generation, new Error("render failed"));
    expect(dispose).toHaveBeenCalledOnce();
    expect(errors).toEqual(["render"]);
    const retry = await kernel.retry();
    expect(retry.status).toBe("mounted");
  });

  it("applies the same load/context/close contract to settings contributions", async () => {
    const order: string[] = [];
    const callbacks: { onClose?: () => void } = {};
    const contribution = defineProductSettingsContribution({
      id: "office-settings",
      label: "Office settings",
      load: async () => {
        order.push("load");
        return {
          default: ({ onClose }: { context: AlphaContext; onClose: () => void }) => {
            callbacks.onClose = onClose;
            return null;
          },
        };
      },
      createContext: () => {
        order.push("create");
        return { kind: "alpha" as const, value: 1 };
      },
      dispose: async () => {
        order.push("dispose");
      },
    });
    const lifecycle = contribution.createLifecycle(lifecycleOptions());
    const mounted = await lifecycle.mount();
    expect(mounted.status).toBe("mounted");
    expect(order).toEqual(["load", "create"]);
    if (mounted.status !== "mounted") {
      return;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(mounted.render()));
    expect(callbacks.onClose).toBeDefined();
    callbacks.onClose?.();
    await vi.waitFor(() => expect(order).toEqual(["load", "create", "dispose"]));
    expect(isValidElement(mounted.render())).toBe(true);
    await act(async () => root.unmount());
  });

  it("serializes a delayed rejecting settings disposer and reports it after cleanup", async () => {
    const cleanup = deferred<void>();
    const disposeStarted = deferred<void>();
    const resources = new Set(["subscription", "timer"]);
    const errors: string[] = [];
    const contribution = defineProductSettingsContribution({
      id: "delayed-settings",
      label: "Delayed settings",
      load: async () => ({ default: () => null }),
      createContext: () => ({ kind: "alpha" as const, value: 1 }),
      dispose: async () => {
        resources.clear();
        disposeStarted.resolve();
        await cleanup.promise;
        throw new Error("settings cleanup report");
      },
    });
    const lifecycle = contribution.createLifecycle({
      createHost: (signal) => testHost(signal),
      onError: (_error, info) => {
        expect(resources.size).toBe(0);
        errors.push(info.kind);
      },
    });
    expect((await lifecycle.mount()).status).toBe("mounted");
    const replacement = lifecycle.mount();
    await disposeStarted.promise;
    let replacementSettled = false;
    void replacement.then(() => {
      replacementSettled = true;
    });
    await Promise.resolve();
    expect(replacementSettled).toBe(false);
    cleanup.resolve();
    await replacement;
    expect(replacementSettled).toBe(true);
    expect(resources.size).toBe(0);
    expect(errors).toEqual(["dispose"]);
  });
});

type SurfaceComponentForTest = (props: { context: AlphaContext }) => null;

function surfaceRegistration<Context>(id: string, route: "/" | `/${string}`, value: Context): SurfaceRegistration<Context> {
  return {
    definition: {
      id,
      label: id,
      route,
      semanticIcon: `${id}-icon`,
      requiredBridgeFeatures: ["snapshot"],
    },
    createContext: () => value,
    load: async () => ({ default: () => null as never }),
    dispose: () => {},
  };
}

function settingsContribution<Context>(id: string, value: Context): ProductSettingsContribution<Context> {
  return {
    id,
    label: id,
    createContext: () => value,
    load: async () => ({ default: () => null }),
    dispose: () => {},
  };
}

function registrationWithContext(id: string, dispose: () => void) {
  return {
    createContext: () => ({ kind: "alpha" as const, value: id.length }),
    load: async () => ({ default: () => null as never }),
    dispose,
  };
}

function lifecycleOptions(errors: string[] = []) {
  return {
    createHost: (signal: AbortSignal) => testHost(signal),
    onError: (_error: unknown, info: { kind: string }) => errors.push(info.kind),
  };
}

function testHost(signal: AbortSignal): SurfaceHostV1 {
  return {
    apiVersion: 1,
    signal,
    runtimes: [],
    navigation: {
      currentSurfaceId: "spaces",
      goTo: () => {},
      subscribe: () => () => {},
    },
    capabilities: {
      forRuntime: () => null,
      admission: () => [],
    },
    commands: {
      dispatch: async () => {
        throw new Error("unused");
      },
    },
    terminals: {
      acquire: () => {
        throw new Error("unused");
      },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function runtime(
  bridgeId: string,
  generationKey: string,
  features: readonly string[],
): BridgeRuntime {
  return {
    id: bridgeId,
    mode: "configured",
    label: bridgeId,
    color: "#89b4fa",
    backend: { id: bridgeId, name: bridgeId, baseUrl: `http://${bridgeId}.example` },
    connectionKey: `${bridgeId}:connection`,
    capabilityGeneration: 1,
    generationKey,
    resumeToken: 0,
    capabilities: {
      bridge_api_version: 1,
      terminal_protocol: 20,
      herdr_version: "0.8.2",
      bridge_version: "test",
      features: [...features],
      commands: ["pane.focus", "pane.close", "tab.focus", "workspace.focus"],
    },
    capabilityState: "ready",
    capabilityError: null,
    canConnect: true,
    httpUrl: (path) => path,
    wsUrl,
  };
}

const wsUrl = (path: string, query?: URLSearchParams) =>
  `ws://test${path}${query && query.toString() ? `?${query.toString()}` : ""}`;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "arraybuffer";
  readonly url: string;
  #listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    for (const listener of this.#listeners.get("close") ?? []) {
      listener(new Event("close"));
    }
  }
}
