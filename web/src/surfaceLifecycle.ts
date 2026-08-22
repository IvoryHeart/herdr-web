import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import type {
  ProductSettingsContribution,
  SurfaceComponent,
  SurfaceHostV1,
  SurfaceRegistration,
} from "./surfaceContract";

export type LifecycleCloseReason =
  | "navigation"
  | "retry"
  | "admission-loss"
  | "render-failure"
  | "settings-close"
  | "assembly-teardown"
  | "replacement"
  | "external";

export type LifecycleErrorKind = "load" | "context" | "dispose" | "render";

export type LifecycleErrorInfo = {
  kind: LifecycleErrorKind;
  generation: number;
  reason: LifecycleCloseReason | null;
};

export type LifecycleErrorReporter = (error: unknown, info: LifecycleErrorInfo) => void;

export type SurfaceLifecycleOptions = {
  createHost: (signal: AbortSignal) => SurfaceHostV1;
  onError?: LifecycleErrorReporter;
};

export type LifecycleMounted<Context, Component> = {
  status: "mounted";
  generation: number;
  component: Component;
  context: Context;
};

export type LifecycleResult<Context, Component> =
  | LifecycleMounted<Context, Component>
  | { status: "stale"; generation: number }
  | { status: "failed"; generation: number };

export type LifecycleRegistration<Context, Component> = {
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{ default: Component }>;
  dispose: (context: Context) => void | Promise<void>;
};

type CreatedContext<Context> = { value: Context };

type Generation<Context> = {
  id: number;
  controller: AbortController;
  host: SurfaceHostV1;
  closing: boolean;
  closeReason: LifecycleCloseReason | null;
  createdContext: CreatedContext<Context> | null;
  disposePromise: Promise<void> | null;
};

/**
 * One serialized lifecycle for one typed registration. The generic remains
 * present for the entire kernel; only the opaque assembly facade erases it.
 */
export class LifecycleKernel<Context, Component> {
  readonly #registration: LifecycleRegistration<Context, Component>;
  readonly #createHost: SurfaceLifecycleOptions["createHost"];
  readonly #onError: LifecycleErrorReporter | undefined;
  #active: Generation<Context> | null = null;
  #closingBarrier: Promise<void> = Promise.resolve();
  #nextGeneration = 0;
  #disposed = false;

  constructor(
    registration: LifecycleRegistration<Context, Component>,
    options: SurfaceLifecycleOptions,
  ) {
    this.#registration = registration;
    this.#createHost = options.createHost;
    this.#onError = options.onError;
  }

  get generation(): number {
    return this.#active?.id ?? this.#nextGeneration;
  }

  async mount(): Promise<LifecycleResult<Context, Component>> {
    await this.#closingBarrier;
    if (this.#active && !this.#active.closing) {
      await this.close("replacement");
    }
    await this.#closingBarrier;
    if (this.#disposed) {
      return { status: "stale", generation: this.#nextGeneration };
    }

    const controller = new AbortController();
    const generation: Generation<Context> = {
      id: ++this.#nextGeneration,
      controller,
      host: this.#createHost(controller.signal),
      closing: false,
      closeReason: null,
      createdContext: null,
      disposePromise: null,
    };
    this.#active = generation;

    let loaded: { default: Component };
    try {
      loaded = await this.#registration.load();
    } catch (error) {
      const reported = await this.#failGeneration(generation, "load", error);
      return { status: reported ? "failed" : "stale", generation: generation.id };
    }

    if (!this.#isCurrent(generation)) {
      return { status: "stale", generation: generation.id };
    }

    let context: Context;
    try {
      context = this.#registration.createContext(generation.host);
    } catch (error) {
      // No assignment occurred, so Foundation has no value it may dispose.
      const reported = await this.#failGeneration(generation, "context", error);
      return { status: reported ? "failed" : "stale", generation: generation.id };
    }
    generation.createdContext = { value: context };

    if (!this.#isCurrent(generation)) {
      // A synchronous factory can trigger navigation through a host callback
      // before it returns. The close requested at that point saw no context;
      // now that creation has completed, settle the bound disposer exactly
      // once before acknowledging the stale result.
      if (generation.closing && generation.disposePromise) {
        const disposal = this.#disposeGeneration(generation);
        generation.disposePromise = disposal;
        this.#closingBarrier = disposal;
        await disposal;
      } else {
        await this.close("external", generation.id);
      }
      return { status: "stale", generation: generation.id };
    }

    return {
      status: "mounted",
      generation: generation.id,
      component: loaded.default,
      context,
    };
  }

  async retry(): Promise<LifecycleResult<Context, Component>> {
    await this.close("retry");
    return this.mount();
  }

  async close(
    reason: LifecycleCloseReason,
    expectedGeneration?: number,
  ): Promise<void> {
    const generation = this.#active;
    if (!generation || (expectedGeneration !== undefined && generation.id !== expectedGeneration)) {
      return;
    }
    if (!generation.closing) {
      generation.closing = true;
      generation.closeReason = reason;
      generation.controller.abort();
      generation.disposePromise = this.#disposeGeneration(generation);
      this.#closingBarrier = generation.disposePromise;
    }
    await generation.disposePromise;
    if (this.#active === generation) {
      this.#active = null;
    }
  }

  async reportRenderFailure(generationId: number, error: unknown): Promise<void> {
    const generation = this.#active;
    if (!generation || generation.id !== generationId || generation.closing) {
      return;
    }
    await this.close("render-failure", generationId);
    this.#report(error, {
      kind: "render",
      generation: generationId,
      reason: "render-failure",
    });
  }

  async teardown(): Promise<void> {
    this.#disposed = true;
    await this.close("assembly-teardown");
  }

  #isCurrent(generation: Generation<Context>): boolean {
    return !this.#disposed && this.#active === generation && !generation.closing;
  }

  async #failGeneration(
    generation: Generation<Context>,
    kind: "load" | "context",
    error: unknown,
  ): Promise<boolean> {
    if (!this.#isCurrent(generation)) {
      return false;
    }
    await this.close(kind === "load" ? "external" : "external", generation.id);
    if (this.#disposed || (this.#active && this.#active !== generation)) {
      return false;
    }
    this.#report(error, {
      kind,
      generation: generation.id,
      reason: generation.closeReason,
    });
    return true;
  }

  async #disposeGeneration(generation: Generation<Context>): Promise<void> {
    const createdContext = generation.createdContext;
    if (!createdContext) {
      return;
    }
    try {
      await this.#registration.dispose(createdContext.value);
    } catch (error) {
      // The disposer has promised strong cleanup safety. Its rejection is
      // reported only after its promise settles, and never escapes the host.
      this.#report(error, {
        kind: "dispose",
        generation: generation.id,
        reason: generation.closeReason,
      });
    }
  }

  #report(error: unknown, info: LifecycleErrorInfo): void {
    try {
      this.#onError?.(error, info);
    } catch {
      // A route-local error reporter cannot be allowed to damage Foundation.
    }
  }
}

export type OpaqueMountResult =
  | { status: "mounted"; generation: number; render: () => ReactNode }
  | { status: "stale"; generation: number }
  | { status: "failed"; generation: number };

export type OpaqueSurfaceLifecycle = {
  mount(): Promise<OpaqueMountResult>;
  retry(): Promise<OpaqueMountResult>;
  close(reason: LifecycleCloseReason): Promise<void>;
  reportRenderFailure(generation: number, error: unknown): Promise<void>;
  teardown(): Promise<void>;
};

export type OpaqueProductSettingsLifecycle = OpaqueSurfaceLifecycle;

export function createOpaqueSurfaceLifecycle<Context>(
  registration: SurfaceRegistration<Context>,
  options: SurfaceLifecycleOptions,
): OpaqueSurfaceLifecycle {
  const kernel = new LifecycleKernel<Context, SurfaceComponent<Context>>(registration, options);
  return opaqueLifecycle(kernel, (component, context) =>
    createElement(component, { context }),
  );
}

export function createOpaqueProductSettingsLifecycle<Context>(
  contribution: ProductSettingsContribution<Context>,
  options: SurfaceLifecycleOptions,
): OpaqueProductSettingsLifecycle {
  const componentKernel = new LifecycleKernel<
    Context,
    ComponentType<{ context: Context; onClose: () => void }>
  >(contribution, options);
  return opaqueLifecycle(componentKernel, (component, context, onClose) =>
    createElement(component, { context, onClose }),
  );
}

function opaqueLifecycle<Context, Component>(
  kernel: LifecycleKernel<Context, Component>,
  renderComponent: (
    component: Component,
    context: Context,
    onClose: () => void,
  ) => ReactNode,
): OpaqueSurfaceLifecycle {
  const mount = async (): Promise<OpaqueMountResult> => {
    const result = await kernel.mount();
    if (result.status !== "mounted") {
      return result;
    }
    const onClose = () => {
      void kernel.close("settings-close", result.generation);
    };
    return {
      status: "mounted",
      generation: result.generation,
      render: () => renderComponent(result.component, result.context, onClose),
    };
  };
  return {
    mount,
    retry: async () => {
      const result = await kernel.retry();
      if (result.status !== "mounted") {
        return result;
      }
      const onClose = () => {
        void kernel.close("settings-close", result.generation);
      };
      return {
        status: "mounted",
        generation: result.generation,
        render: () => renderComponent(result.component, result.context, onClose),
      };
    },
    close: (reason) => kernel.close(reason),
    reportRenderFailure: (generation, error) => kernel.reportRenderFailure(generation, error),
    teardown: () => kernel.teardown(),
  };
}
