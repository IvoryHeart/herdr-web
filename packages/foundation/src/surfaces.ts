/** The only surface contract version supported by this Foundation release. */
export const FOUNDATION_SURFACE_API_VERSION = 1 as const;
export const FOUNDATION_BRIDGE_API_VERSION = 1 as const;
export const FOUNDATION_WEB_COMPAT = 1 as const;
export const FOUNDATION_SUPPORTED_HERDR = ">=0.8.2" as const;
export const FOUNDATION_TERMINAL_PROTOCOL = 20 as const;

export type SurfaceRoute = "/" | `/${string}`;

export type SurfaceDefinition = {
  id: string;
  label: string;
  route: SurfaceRoute;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

/** React-compatible component shape without pulling a second React runtime into Foundation. */
export type SurfaceComponent<Context> = (props: { context: Context }) => unknown;

export type SurfaceRegistration<Context> = {
  definition: SurfaceDefinition;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{ default: SurfaceComponent<Context> }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type ProductSettingsComponent<Context> = (props: {
  context: Context;
  onClose: () => void;
}) => unknown;

export type ProductSettingsContribution<Context> = {
  id: string;
  label: string;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{ default: ProductSettingsComponent<Context> }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type BridgeFeature =
  | "snapshot"
  | "structural_events"
  | "shared_selection"
  | "agent_activity"
  | "agent_pins"
  | "launcher_presets"
  | "notes"
  | "uploads"
  | "terminal_attach"
  | "terminal_input"
  | "terminal_resize"
  | "terminal_scroll"
  | "terminal_shared_fanout"
  | "observability_extension";

export const FOUNDATION_BRIDGE_FEATURES: readonly BridgeFeature[] = [
  "snapshot",
  "structural_events",
  "shared_selection",
  "agent_activity",
  "agent_pins",
  "launcher_presets",
  "notes",
  "uploads",
  "terminal_attach",
  "terminal_input",
  "terminal_resize",
  "terminal_scroll",
  "terminal_shared_fanout",
  "observability_extension",
];

export type BridgeCommand =
  | "workspace.create"
  | "workspace.rename"
  | "workspace.close"
  | "workspace.focus"
  | "workspace.move_block"
  | "tab.create"
  | "tab.rename"
  | "tab.close"
  | "tab.focus"
  | "pane.rename"
  | "pane.close"
  | "pane.split"
  | "pane.focus_direction"
  | "pane.move";

export const FOUNDATION_BRIDGE_COMMANDS: readonly BridgeCommand[] = [
  "workspace.create",
  "workspace.rename",
  "workspace.close",
  "workspace.focus",
  "workspace.move_block",
  "tab.create",
  "tab.rename",
  "tab.close",
  "tab.focus",
  "pane.rename",
  "pane.close",
  "pane.split",
  "pane.focus_direction",
  "pane.move",
];

const COMMAND_TARGET_KINDS: Readonly<Record<BridgeCommand, SurfaceTargetKind>> = {
  "workspace.create": "workspace",
  "workspace.rename": "workspace",
  "workspace.close": "workspace",
  "workspace.focus": "workspace",
  "workspace.move_block": "workspace",
  "tab.create": "workspace",
  "tab.rename": "tab",
  "tab.close": "tab",
  "tab.focus": "tab",
  "pane.rename": "pane",
  "pane.close": "pane",
  "pane.split": "pane",
  "pane.focus_direction": "pane",
  "pane.move": "pane",
};

export type SurfaceTargetKind = "workspace" | "tab" | "pane" | "terminal" | "agent";

/** A cross-host identity; native IDs are never valid without a bridge ID. */
export type QualifiedSurfaceTarget = {
  bridgeId: string;
  kind: SurfaceTargetKind;
  nativeTargetId: string;
};

export type SurfaceWorkspace = {
  readonly target: QualifiedSurfaceTarget;
  readonly label: string;
  readonly terminalTarget?: QualifiedSurfaceTarget;
};

export type SurfaceBridgeRuntime = {
  bridgeId: string;
  label: string;
  generationKey: string;
  available: boolean;
  features: readonly string[];
  readonly workspaces?: readonly SurfaceWorkspace[];
};

export type SurfaceHostEvent =
  | { type: "runtime-changed"; bridgeId: string }
  | { type: "selection-changed"; target: QualifiedSurfaceTarget };

export type SurfaceCommandRequest = {
  command: BridgeCommand;
  target: QualifiedSurfaceTarget;
  params?: Readonly<Record<string, string | number | boolean | null>>;
};

export type TerminalOutput = Uint8Array;
export type TerminalOutputListener = (data: TerminalOutput) => void;

export type TerminalHandle = {
  readonly key: string;
  readonly target: QualifiedSurfaceTarget;
  attach: () => void | Promise<void>;
  input: (value: string | Uint8Array) => void | Promise<void>;
  resize: (columns: number, rows: number) => void | Promise<void>;
  scroll: (direction: "up" | "down", lines?: number) => void | Promise<void>;
  subscribe: (listener: TerminalOutputListener) => () => void;
  focus: () => void;
  detach: () => void;
  release: () => void | Promise<void>;
};

export type TerminalHandleFactory = (
  target: QualifiedSurfaceTarget,
) => Promise<TerminalHandle>;

/**
 * Host-owned fanout for terminal views. Releasing the last browser handle
 * releases the transport owner only; it never dispatches a pane-close command.
 */
export class SharedTerminalHandlePool {
  readonly #entries = new Map<string, { owner: TerminalHandle; references: number }>();
  readonly #pending = new Map<string, Promise<{ owner: TerminalHandle; references: number }>>();
  readonly #releasing = new Map<string, Promise<void>>();

  async acquire(target: QualifiedSurfaceTarget, factory: TerminalHandleFactory) {
    const validated = validateQualifiedSurfaceTarget(target);
    if (validated.kind !== "terminal") {
      throw new SurfaceContractError("invalid-id", "Terminal acquisition requires a terminal target");
    }
    const key = terminalTargetKey(validated);
    const releasing = this.#releasing.get(key);
    if (releasing) {
      // A new view must not overlap the previous owner's detach/close. The
      // terminal pane remains alive, but transport ownership is still
      // serialized at this boundary.
      await releasing;
    }
    let entry = this.#entries.get(key);
    if (!entry) {
      let pending = this.#pending.get(key);
      if (!pending) {
        pending = Promise.resolve()
          .then(() => factory(validated))
          .then((owner) => {
            const acquired = { owner, references: 0 };
            this.#entries.set(key, acquired);
            return acquired;
        });
        this.#pending.set(key, pending);
        void pending.then(
          () => {
            if (this.#pending.get(key) === pending) {
              this.#pending.delete(key);
            }
          },
          () => {
            if (this.#pending.get(key) === pending) {
              this.#pending.delete(key);
            }
          },
        );
      }
      entry = await pending;
    }
    entry.references += 1;
    let released = false;
    const owner = entry.owner;
    return Object.freeze({
      key: owner.key,
      target: owner.target,
      attach: (...args: Parameters<TerminalHandle["attach"]>) => owner.attach(...args),
      input: (...args: Parameters<TerminalHandle["input"]>) => owner.input(...args),
      resize: (...args: Parameters<TerminalHandle["resize"]>) => owner.resize(...args),
      scroll: (...args: Parameters<TerminalHandle["scroll"]>) => owner.scroll(...args),
      subscribe: (...args: Parameters<TerminalHandle["subscribe"]>) => owner.subscribe(...args),
      focus: (...args: Parameters<TerminalHandle["focus"]>) => owner.focus(...args),
      detach: (...args: Parameters<TerminalHandle["detach"]>) => owner.detach(...args),
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        const current = this.#entries.get(key);
        if (!current) {
          return;
        }
        current.references -= 1;
        if (current.references === 0) {
          this.#entries.delete(key);
          const releasing = Promise.resolve(current.owner.release()).finally(() => {
            if (this.#releasing.get(key) === releasing) {
              this.#releasing.delete(key);
            }
          });
          this.#releasing.set(key, releasing);
          await releasing;
        }
      },
    }) satisfies TerminalHandle;
  }

  get size() {
    return this.#entries.size;
  }
}

export function terminalTargetKey(target: QualifiedSurfaceTarget) {
  const validated = validateQualifiedSurfaceTarget(target);
  return JSON.stringify([validated.bridgeId, validated.nativeTargetId]);
}

export type SurfaceHostV1 = {
  /** Abort signal for the current surface/settings generation. */
  readonly signal: AbortSignal;
  readonly runtimes: () => readonly SurfaceBridgeRuntime[];
  readonly subscribe: (listener: (event: SurfaceHostEvent) => void) => () => void;
  readonly retry: (bridgeId?: string) => void;
  readonly dispatch: (request: SurfaceCommandRequest) => Promise<Readonly<Record<string, unknown>>>;
  readonly navigate: (target: QualifiedSurfaceTarget) => void;
  readonly acquireTerminal: (
    target: QualifiedSurfaceTarget,
  ) => Promise<TerminalHandle>;
};

export function validateQualifiedSurfaceTarget(target: QualifiedSurfaceTarget): QualifiedSurfaceTarget {
  if (
    !target ||
    typeof target.bridgeId !== "string" ||
    !target.bridgeId.trim() ||
    typeof target.nativeTargetId !== "string" ||
    !target.nativeTargetId.trim() ||
    !["workspace", "tab", "pane", "terminal", "agent"].includes(target.kind)
  ) {
    throw new SurfaceContractError(
      "invalid-id",
      "Surface targets require a bridgeId, kind, and nativeTargetId",
    );
  }
  return Object.freeze({ ...target });
}

export function validateSurfaceCommandRequest(
  request: SurfaceCommandRequest,
): SurfaceCommandRequest {
  validateQualifiedSurfaceTarget(request.target);
  if (!FOUNDATION_BRIDGE_COMMANDS.includes(request.command)) {
    throw new SurfaceContractError(
      "invalid-command",
      `Surface command is not allow-listed: ${request.command}`,
    );
  }
  if (request.target.kind !== COMMAND_TARGET_KINDS[request.command]) {
    throw new SurfaceContractError(
      "invalid-command",
      `Surface command ${request.command} requires a ${COMMAND_TARGET_KINDS[request.command]} target`,
    );
  }
  if (request.params) {
    for (const value of Object.values(request.params)) {
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new SurfaceContractError(
          "invalid-command",
          "Surface command parameters must be scalar values",
        );
      }
    }
    const direction = request.params.direction;
    if (
      request.command === "pane.split" &&
      direction !== undefined &&
      direction !== "right" &&
      direction !== "down"
    ) {
      throw new SurfaceContractError("invalid-command", "Pane split direction is invalid");
    }
    if (
      request.command === "pane.focus_direction" &&
      direction !== undefined &&
      direction !== "left" &&
      direction !== "right" &&
      direction !== "up" &&
      direction !== "down"
    ) {
      throw new SurfaceContractError("invalid-command", "Pane focus direction is invalid");
    }
    if (
      request.command === "pane.move" &&
      request.params.destination !== undefined &&
      request.params.destination !== "new_tab" &&
      request.params.destination !== "new_workspace"
    ) {
      throw new SurfaceContractError("invalid-command", "Pane move destination is invalid");
    }
  }
  return request;
}

const opaqueRegistration = Symbol("opaqueRegistration");
const opaqueSettings = Symbol("opaqueSettings");

/** Publicly passable storage that intentionally does not expose its context type. */
export type OpaqueSurfaceRegistration = {
  readonly [opaqueRegistration]: "SurfaceRegistration";
  readonly definition: SurfaceDefinition;
};

export type OpaqueProductSettingsContribution = {
  readonly [opaqueSettings]: "ProductSettingsContribution";
  readonly id: string;
  readonly label: string;
};

export type ProductAssembly = {
  readonly surfaceApiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  readonly surfaces: readonly OpaqueSurfaceRegistration[];
  readonly productSettings?: OpaqueProductSettingsContribution;
};

type InternalSurfaceRegistration = OpaqueSurfaceRegistration & {
  readonly [surfaceImplementation]: SurfaceRegistration<unknown>;
};
type InternalSettingsContribution = OpaqueProductSettingsContribution & {
  readonly [settingsImplementation]: ProductSettingsContribution<unknown>;
};

const surfaceImplementation = Symbol("surfaceImplementation");
const settingsImplementation = Symbol("settingsImplementation");

const VALID_ID = /^[a-z][a-z0-9-]*$/u;
const VALID_ROUTE = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*)?(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*))*$/u;

export class SurfaceContractError extends Error {
  readonly code:
    | "api-version"
    | "invalid-id"
    | "invalid-route"
    | "duplicate-id"
    | "duplicate-route"
    | "invalid-feature"
    | "invalid-command"
    | "invalid-settings";

  constructor(code: SurfaceContractError["code"], message: string) {
    super(message);
    this.name = "SurfaceContractError";
    this.code = code;
  }
}

function cloneDefinition(definition: SurfaceDefinition): SurfaceDefinition {
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    route: definition.route,
    semanticIcon: definition.semanticIcon,
    requiredBridgeFeatures: Object.freeze([...definition.requiredBridgeFeatures]),
  });
}

export function validateSurfaceDefinition(definition: SurfaceDefinition): SurfaceDefinition {
  if (!VALID_ID.test(definition.id)) {
    throw new SurfaceContractError("invalid-id", `Invalid surface ID: ${definition.id}`);
  }
  if (!definition.label.trim() || !definition.semanticIcon.trim()) {
    throw new SurfaceContractError("invalid-id", `Surface ${definition.id} has empty metadata`);
  }
  if (!VALID_ROUTE.test(definition.route)) {
    throw new SurfaceContractError("invalid-route", `Invalid surface route: ${definition.route}`);
  }
  if (definition.id === "spaces" && definition.route !== "/") {
    throw new SurfaceContractError("invalid-route", "The Spaces surface must use route /");
  }
  if (definition.id === "world" && definition.route !== "/world") {
    throw new SurfaceContractError("invalid-route", "The world surface must use route /world");
  }
  const seenFeatures = new Set<string>();
  for (const feature of definition.requiredBridgeFeatures) {
    if (!FOUNDATION_BRIDGE_FEATURES.includes(feature as BridgeFeature)) {
      throw new SurfaceContractError(
        "invalid-feature",
        `Surface ${definition.id} requests an unknown bridge feature: ${feature}`,
      );
    }
    if (seenFeatures.has(feature)) {
      throw new SurfaceContractError(
        "invalid-feature",
        `Surface ${definition.id} repeats bridge feature: ${feature}`,
      );
    }
    seenFeatures.add(feature);
  }
  return cloneDefinition(definition);
}

/** Bind a typed registration to opaque storage without weakening its generic. */
export function defineSurface<Context>(
  registration: SurfaceRegistration<Context>,
): OpaqueSurfaceRegistration {
  const definition = validateSurfaceDefinition(registration.definition);
  const stored = {
    definition,
    [opaqueRegistration]: "SurfaceRegistration" as const,
    [surfaceImplementation]: registration as SurfaceRegistration<unknown>,
  } as InternalSurfaceRegistration;
  return Object.freeze(stored);
}

/** Bind a typed settings contribution to opaque storage without weakening its generic. */
export function defineProductSettings<Context>(
  contribution: ProductSettingsContribution<Context>,
): OpaqueProductSettingsContribution {
  if (!VALID_ID.test(contribution.id) || !contribution.label.trim()) {
    throw new SurfaceContractError(
      "invalid-settings",
      `Invalid product-settings contribution: ${contribution.id}`,
    );
  }
  return Object.freeze({
    id: contribution.id,
    label: contribution.label,
    [opaqueSettings]: "ProductSettingsContribution" as const,
    [settingsImplementation]: contribution as ProductSettingsContribution<unknown>,
  } as InternalSettingsContribution);
}

export function createProductAssembly(input: {
  surfaceApiVersion: number;
  surfaces: readonly OpaqueSurfaceRegistration[];
  productSettings?: OpaqueProductSettingsContribution;
}): ProductAssembly {
  if (input.surfaceApiVersion !== FOUNDATION_SURFACE_API_VERSION) {
    throw new SurfaceContractError(
      "api-version",
      `Surface API ${String(input.surfaceApiVersion)} is incompatible; expected ${FOUNDATION_SURFACE_API_VERSION}`,
    );
  }
  const ids = new Map<string, string>();
  const routes = new Map<string, string>();
  for (const surface of input.surfaces) {
    const definition = validateSurfaceDefinition(surface.definition);
    const previousId = ids.get(definition.id);
    if (previousId) {
      throw new SurfaceContractError(
        "duplicate-id",
        `Duplicate surface ID ${definition.id} (${previousId} and ${definition.id})`,
      );
    }
    const previousRoute = routes.get(definition.route);
    if (previousRoute) {
      throw new SurfaceContractError(
        "duplicate-route",
        `Duplicate surface route ${definition.route} (${previousRoute} and ${definition.id})`,
      );
    }
    ids.set(definition.id, definition.id);
    routes.set(definition.route, definition.id);
  }
  return Object.freeze({
    surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
    surfaces: Object.freeze([...input.surfaces]),
    ...(input.productSettings ? { productSettings: input.productSettings } : {}),
  });
}

export function createSurfaceHostV1(
  host: Omit<SurfaceHostV1, "signal">,
  signal: AbortSignal,
): SurfaceHostV1 {
  return Object.freeze({
    ...host,
    signal,
    dispatch: async (request) => host.dispatch(validateSurfaceCommandRequest(request)),
    navigate: (target) => host.navigate(validateQualifiedSurfaceTarget(target)),
    acquireTerminal: async (target) => {
      const validated = validateQualifiedSurfaceTarget(target);
      if (validated.kind !== "terminal") {
        throw new SurfaceContractError(
          "invalid-id",
          "Terminal acquisition requires a terminal target",
        );
      }
      return host.acquireTerminal(validated);
    },
  });
}

export type SurfaceLifecycleStatus = "idle" | "loading" | "ready" | "closing" | "error";
export type SurfaceLifecycleSnapshot = {
  status: SurfaceLifecycleStatus;
  generation: number;
  component: SurfaceComponent<unknown> | null;
  context: unknown | null;
  error: unknown | null;
};

type LifecycleImplementation = {
  load: () => Promise<{ default: SurfaceComponent<unknown> }>;
  createContext: (host: SurfaceHostV1) => unknown;
  dispose: (context: unknown) => void | Promise<void>;
};

type LifecycleOptions = {
  host: Omit<SurfaceHostV1, "signal">;
  onError?: (error: unknown) => void;
};

type ActiveGeneration = {
  number: number;
  controller: AbortController;
  context: unknown | null;
  contextCreated: boolean;
  disposePromise: Promise<void> | null;
  closed: boolean;
};

/**
 * Generation-safe loader used by both surface and product-settings shells.
 * It deliberately keeps the typed registration behind an internal adapter;
 * callers can never pair a component or disposer with another context.
 */
export class SurfaceLifecycle {
  #status: SurfaceLifecycleStatus = "idle";
  #generation = 0;
  #component: SurfaceComponent<unknown> | null = null;
  #context: unknown | null = null;
  #error: unknown | null = null;
  #active: ActiveGeneration | null = null;
  #closing: Promise<void> | null = null;
  readonly #implementation: LifecycleImplementation;
  readonly #options: LifecycleOptions;

  constructor(
    registration: OpaqueSurfaceRegistration | OpaqueProductSettingsContribution,
    options: LifecycleOptions,
  ) {
    const implementation = (registration as InternalSurfaceRegistration)[surfaceImplementation]
      ?? (registration as InternalSettingsContribution)[settingsImplementation];
    if (!implementation) {
      throw new TypeError("The registration was not created by this Foundation package");
    }
    this.#implementation = implementation;
    this.#options = options;
  }

  get snapshot(): SurfaceLifecycleSnapshot {
    return {
      status: this.#status,
      generation: this.#generation,
      component: this.#component,
      context: this.#context,
      error: this.#error,
    };
  }

  async open(): Promise<SurfaceLifecycleSnapshot> {
    // Treat a second open as a replacement, including concurrent retry/open
    // callers. This keeps a returned context owned by exactly one generation
    // and makes delayed disposal a hard serialization boundary.
    if (this.#active) {
      try {
        await this.close();
      } catch {
        // The disposer has settled and reported its error; a fresh generation
        // is still allowed to start.
      }
    }
    if (this.#closing) {
      await this.#waitForClosing();
    }
    return this.#beginOpen();
  }

  #beginOpen(): Promise<SurfaceLifecycleSnapshot> {
    const number = ++this.#generation;
    const controller = new AbortController();
    const active: ActiveGeneration = {
      number,
      controller,
      context: null,
      contextCreated: false,
      disposePromise: null,
      closed: false,
    };
    this.#active = active;
    this.#status = "loading";
    this.#component = null;
    this.#context = null;
    this.#error = null;
    return (async () => {
      try {
      const loaded = await this.#implementation.load();
      if (!this.#isCurrent(active)) {
        return this.snapshot;
      }
      const host = createSurfaceHostV1(this.#options.host, controller.signal);
      const context = this.#implementation.createContext(host);
      if (!this.#isCurrent(active)) {
        return this.snapshot;
      }
      active.context = context;
      active.contextCreated = true;
      this.#context = context;
      this.#component = loaded.default;
      this.#status = "ready";
      return this.snapshot;
      } catch (error) {
        if (this.#isCurrent(active)) {
          active.closed = true;
          controller.abort();
          this.#status = "error";
          this.#error = error;
          this.#options.onError?.(error);
        }
        return this.snapshot;
      }
    })();
  }

  async close(): Promise<void> {
    const active = this.#active;
    if (!active) {
      return;
    }
    if (this.#closing) {
      return this.#closing;
    }
    active.closed = true;
    active.controller.abort();
    this.#status = "closing";
    this.#closing = (async () => {
      if (!active.contextCreated) {
        return;
      }
      if (!active.disposePromise) {
        active.disposePromise = Promise.resolve(this.#implementation.dispose(active.context));
      }
      await active.disposePromise;
    })().catch((error: unknown) => {
      this.#error = error;
      this.#options.onError?.(error);
      throw error;
    }).finally(() => {
      if (this.#active === active) {
        this.#active = null;
        this.#component = null;
        this.#context = null;
        this.#status = "idle";
      }
      this.#closing = null;
    });
    return this.#closing;
  }

  async replace(): Promise<SurfaceLifecycleSnapshot> {
    try {
      await this.close();
    } catch {
      // Cleanup is complete before the error is contained and a fresh attempt begins.
    }
    return this.open();
  }

  async retry(): Promise<SurfaceLifecycleSnapshot> {
    return this.replace();
  }

  async dispose(): Promise<void> {
    try {
      await this.close();
    } catch {
      // The disposer error was already reported after its cleanup settled.
    }
  }

  #isCurrent(active: ActiveGeneration) {
    return this.#active === active && !active.closed && active.number === this.#generation;
  }

  async #waitForClosing() {
    if (!this.#closing) {
      return;
    }
    try {
      await this.#closing;
    } catch {
      // Replacement is allowed after a contained, fully-settled disposer failure.
    }
  }
}

export function createSurfaceLifecycle(
  registration: OpaqueSurfaceRegistration,
  options: LifecycleOptions,
) {
  return new SurfaceLifecycle(registration, options);
}

export function createSettingsLifecycle(
  contribution: OpaqueProductSettingsContribution,
  options: LifecycleOptions,
) {
  return new SurfaceLifecycle(contribution, options);
}

/** Internal host adapter used by a product shell to lazy-load an opaque registration. */
export async function loadOpaqueSurface(
  registration: OpaqueSurfaceRegistration,
): Promise<{ default: SurfaceComponent<unknown> }> {
  const implementation = (registration as InternalSurfaceRegistration)[surfaceImplementation];
  if (!implementation) {
    throw new TypeError("The registration was not created by this Foundation package");
  }
  return implementation.load();
}

/** Internal host adapter used by a product shell to lazy-load product settings. */
export async function loadOpaqueProductSettings(
  contribution: OpaqueProductSettingsContribution,
): Promise<{ default: ProductSettingsComponent<unknown> }> {
  const implementation = (contribution as InternalSettingsContribution)[settingsImplementation];
  if (!implementation) {
    throw new TypeError("The contribution was not created by this Foundation package");
  }
  return implementation.load();
}

/** Helper for factories that acquire multiple resources before returning a context. */
export async function withAcquisitionGuard<Context>(
  acquire: (release: (cleanup: () => void | Promise<void>) => void) => Promise<Context> | Context,
): Promise<Context> {
  const cleanups: Array<() => void | Promise<void>> = [];
  let returned = false;
  try {
    const context = await acquire((cleanup) => {
      cleanups.unshift(cleanup);
    });
    returned = true;
    return context;
  } finally {
    if (!returned) {
      await settleCleanups(cleanups);
    }
  }
}

export async function settleCleanups(
  cleanups: readonly (() => void | Promise<void>)[],
): Promise<void> {
  let firstError: unknown = null;
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== null) {
    throw firstError;
  }
}
