import type { ComponentType } from "react";
import { BRIDGE_CAPABILITY_FEATURES, type BridgeRuntime } from "./bridge";
import type { BridgeHttpUrl } from "./bridgeApi";
import { terminalSessionOwners } from "./terminalSessionOwner";
import type {
  TerminalSessionHandle,
  TerminalSessionOwnerState,
} from "./terminalSessionOwner";
import type { TerminalSize } from "./terminalRenderer";
import {
  createOpaqueProductSettingsLifecycle,
  createOpaqueSurfaceLifecycle,
} from "./surfaceLifecycle";
import type {
  OpaqueProductSettingsLifecycle,
  OpaqueSurfaceLifecycle,
  SurfaceLifecycleOptions,
} from "./surfaceLifecycle";

/** The only surface API version understood by this Foundation tranche. */
export const FOUNDATION_SURFACE_API_VERSION = 1 as const;

export type SurfaceRoute = "/" | `/${string}`;

export type SurfaceDefinition = {
  id: string;
  label: string;
  route: SurfaceRoute;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

export type SurfaceComponent<Context> = ComponentType<{ context: Context }>;

export type SurfaceRuntimeIdentity = {
  bridgeId: string;
  connectionKey: string;
  generationKey: string;
};

export type SurfaceRuntimeState =
  | "disabled"
  | "connecting"
  | "ready"
  | "degraded"
  | "incompatible"
  | "offline";

export type SurfaceRuntimeView = {
  identity: SurfaceRuntimeIdentity;
  label: string;
  state: SurfaceRuntimeState;
  features: readonly string[];
  commands: readonly string[];
};

export type SurfaceCapabilityAdmission = {
  identity: SurfaceRuntimeIdentity;
  available: boolean;
  missingFeatures: readonly string[];
  state: SurfaceRuntimeState;
};

export type SurfaceTargetKind = "workspace" | "tab" | "pane" | "terminal";

export type SurfaceTarget = {
  identity: SurfaceRuntimeIdentity;
  kind: SurfaceTargetKind;
  nativeTargetId: string;
};

export type SurfaceCommand =
  | { type: "focusWorkspace"; target: SurfaceTarget & { kind: "workspace" } }
  | { type: "focusTab"; target: SurfaceTarget & { kind: "tab" } }
  | { type: "focusPane"; target: SurfaceTarget & { kind: "pane" } }
  | { type: "closePane"; target: SurfaceTarget & { kind: "pane" } };

export type SurfaceCommandResult = {
  accepted: true;
  target: SurfaceTarget;
};

export type SurfaceTerminalAcquireOptions = {
  outputCoalesceMs: number;
  initialSize: TerminalSize;
  inputEnabled: boolean;
  resizeEnabled: boolean;
  scrollEnabled: boolean;
  focusOwner: boolean;
  onOutput: (data: Uint8Array) => void;
  onState: (state: TerminalSessionOwnerState) => void;
  onConnectAttempt: () => void;
};

export type SurfaceTerminalHandle = Pick<
  TerminalSessionHandle,
  | "updateAdmission"
  | "setFocusOwner"
  | "reportSize"
  | "sendInput"
  | "sendScroll"
  | "requestReconnect"
  | "release"
>;

export type SurfaceHostV1 = {
  readonly apiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  readonly signal: AbortSignal;
  readonly runtimes: readonly SurfaceRuntimeView[];
  readonly navigation: {
    readonly currentSurfaceId: string;
    goTo(surfaceId: string): void;
    subscribe(listener: (surfaceId: string) => void): () => void;
  };
  readonly capabilities: {
    forRuntime(bridgeId: string): SurfaceCapabilityAdmission | null;
    admission(requiredFeatures: readonly string[]): readonly SurfaceCapabilityAdmission[];
  };
  readonly commands: {
    dispatch(command: SurfaceCommand): Promise<SurfaceCommandResult>;
  };
  readonly terminals: {
    acquire(
      target: SurfaceTarget & { kind: "terminal" },
      options: SurfaceTerminalAcquireOptions,
    ): SurfaceTerminalHandle;
  };
};

export type SurfaceRegistration<Context> = {
  definition: SurfaceDefinition;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{ default: SurfaceComponent<Context> }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type ProductSettingsContribution<Context> = {
  id: string;
  label: string;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{
    default: ComponentType<{ context: Context; onClose: () => void }>;
  }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type SurfaceDefinitionInput = {
  id: string;
  label: string;
  route: string;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

/**
 * Runtime validation is kept separate from the typed definition so malformed
 * assembly data can be rejected with a useful diagnostic at startup/tests.
 */
export function validateSurfaceDefinition(input: SurfaceDefinitionInput): SurfaceDefinition {
  const id = validateIdentifier(input.id, "surface ID");
  const label = validateText(input.label, "surface label");
  const route = validateRoute(input.route);
  const semanticIcon = validateText(input.semanticIcon, "surface semantic icon");
  const requiredBridgeFeatures = validateFeatureNames(input.requiredBridgeFeatures);
  return {
    id,
    label,
    route,
    semanticIcon,
    requiredBridgeFeatures,
  };
}

function validateIdentifier(value: string, kind: string): string {
  if (!/^[a-z][a-z0-9-]*$/u.test(value)) {
    throw new Error(`Invalid ${kind}: ${JSON.stringify(value)}`);
  }
  return value;
}

function validateText(value: string, kind: string): string {
  if (!value.trim() || value.length > 120 || hasControlCharacters(value)) {
    throw new Error(`Invalid ${kind}`);
  }
  return value;
}

function validateRoute(value: string): SurfaceRoute {
  if (!isSurfaceRoute(value)) {
    throw new Error(`Invalid surface route: ${JSON.stringify(value)}`);
  }
  return value;
}

function isSurfaceRoute(value: string): value is SurfaceRoute {
  return value === "/" || /^\/[a-z0-9](?:[a-z0-9/_-]*[a-z0-9])?$/iu.test(value);
}

function validateFeatureNames(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const knownFeatures = new Set<string>(BRIDGE_CAPABILITY_FEATURES);
  for (const value of values) {
    if (!/^[a-z][a-z0-9_.-]*$/u.test(value)) {
      throw new Error(`Invalid required bridge feature: ${JSON.stringify(value)}`);
    }
    if (!knownFeatures.has(value)) {
      throw new Error(`Unknown required bridge feature: ${value}`);
    }
    if (seen.has(value)) {
      throw new Error(`Duplicate required bridge feature: ${value}`);
    }
    seen.add(value);
  }
  return [...values];
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

class OpaqueSurfaceRegistration {
  readonly definition: SurfaceDefinition;
  readonly #createLifecycle: (options: SurfaceLifecycleOptions) => OpaqueSurfaceLifecycle;

  private constructor(
    definition: SurfaceDefinition,
    createLifecycle: (options: SurfaceLifecycleOptions) => OpaqueSurfaceLifecycle,
  ) {
    this.definition = definition;
    this.#createLifecycle = createLifecycle;
  }

  static from<Context>(registration: SurfaceRegistration<Context>): OpaqueSurfaceRegistration {
    const definition = validateSurfaceDefinition(registration.definition);
    return new OpaqueSurfaceRegistration(definition, (options) =>
      createOpaqueSurfaceLifecycle({ ...registration, definition }, options),
    );
  }

  createLifecycle(options: SurfaceLifecycleOptions): OpaqueSurfaceLifecycle {
    return this.#createLifecycle(options);
  }
}

export type SurfaceRegistrationToken = {
  readonly definition: SurfaceDefinition;
};

export function defineSurface<Context>(
  registration: SurfaceRegistration<Context>,
): SurfaceRegistrationToken {
  return OpaqueSurfaceRegistration.from(registration);
}

class OpaqueProductSettingsContribution {
  readonly id: string;
  readonly label: string;
  readonly #createLifecycle: (
    options: SurfaceLifecycleOptions,
  ) => OpaqueProductSettingsLifecycle;

  private constructor(
    id: string,
    label: string,
    createLifecycle: (options: SurfaceLifecycleOptions) => OpaqueProductSettingsLifecycle,
  ) {
    this.id = id;
    this.label = label;
    this.#createLifecycle = createLifecycle;
  }

  static from<Context>(
    contribution: ProductSettingsContribution<Context>,
  ): OpaqueProductSettingsContribution {
    const id = validateIdentifier(contribution.id, "settings contribution ID");
    const label = validateText(contribution.label, "settings contribution label");
    return new OpaqueProductSettingsContribution(id, label, (options) =>
      createOpaqueProductSettingsLifecycle({ ...contribution, id, label }, options),
    );
  }

  createLifecycle(options: SurfaceLifecycleOptions): OpaqueProductSettingsLifecycle {
    return this.#createLifecycle(options);
  }
}

export function defineProductSettingsContribution<Context>(
  contribution: ProductSettingsContribution<Context>,
): ProductSettingsContributionToken {
  return OpaqueProductSettingsContribution.from(contribution);
}

export type ProductSettingsContributionToken = {
  readonly id: string;
  readonly label: string;
};

export type ProductAssembly = {
  surfaceApiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  surfaces: readonly SurfaceRegistrationToken[];
  productSettings?: ProductSettingsContributionToken;
};

type ProductAssemblyCandidate = {
  surfaceApiVersion?: number;
  surfaces: readonly SurfaceRegistrationToken[];
  productSettings?: ProductSettingsContributionToken;
};

export function validateProductAssembly(
  assembly: ProductAssemblyCandidate,
): asserts assembly is ProductAssembly {
  assertFoundationSurfaceApiVersion(assembly.surfaceApiVersion);
  if (assembly.surfaces.length === 0) {
    throw new Error("Surface assembly must register at least one surface");
  }
  const ids = new Set<string>();
  const routes = new Map<string, string>();
  for (const surface of assembly.surfaces) {
    const definition = validateSurfaceDefinition(surface.definition);
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate surface ID: ${definition.id}`);
    }
    ids.add(definition.id);
    const normalizedRoute = normalizeRoute(definition.route);
    const priorId = routes.get(normalizedRoute);
    if (priorId) {
      throw new Error(
        `Duplicate surface route ${normalizedRoute}: ${priorId} and ${definition.id}`,
      );
    }
    routes.set(normalizedRoute, definition.id);
  }
}

export function createProductAssembly(input: ProductAssembly): ProductAssembly {
  validateProductAssembly(input);
  return input;
}

export function assertFoundationSurfaceApiVersion(
  observed: number | null | undefined,
): asserts observed is typeof FOUNDATION_SURFACE_API_VERSION {
  if (observed !== FOUNDATION_SURFACE_API_VERSION) {
    const observedLabel = observed === undefined ? "missing" : String(observed);
    throw new Error(
      `Foundation surface API version mismatch: expected ${FOUNDATION_SURFACE_API_VERSION}, observed ${observedLabel}. Install a Foundation release exposing exactly API ${FOUNDATION_SURFACE_API_VERSION}; range negotiation is not supported.`,
    );
  }
}

function normalizeRoute(route: SurfaceRoute): string {
  return route.length > 1 ? route.replace(/\/+$/u, "") : route;
}

export type FoundationRuntimeSource = {
  runtime: BridgeRuntime;
  wsUrl: BridgeHttpUrl;
};

export type SurfaceCommandOwner = {
  dispatch(
    command: SurfaceCommand,
    runtime: SurfaceRuntimeView,
    signal: AbortSignal,
  ): Promise<SurfaceCommandResult>;
};

export type SurfaceNavigationOwner = {
  currentSurfaceId: string;
  goTo(surfaceId: string): void;
  subscribe(listener: (surfaceId: string) => void): () => void;
};

export type SurfaceHostFactoryInput = {
  signal: AbortSignal;
  runtimes: readonly FoundationRuntimeSource[];
  navigation: SurfaceNavigationOwner;
  commandOwner: SurfaceCommandOwner;
};

/**
 * Builds the least-purpose host adapter. The construction-only runtime source
 * contains Foundation callbacks; the resulting host exposes views and narrow
 * semantic handles, never URLs, sockets, profiles, or arbitrary commands.
 */
export function createSurfaceHostV1(input: SurfaceHostFactoryInput): SurfaceHostV1 {
  const sourceByBridgeId = new Map(
    input.runtimes.map((source) => [source.runtime.id, source]),
  );
  const runtimes = input.runtimes.map((source) => runtimeView(source.runtime));
  const runtimeByBridgeId = new Map(runtimes.map((runtime) => [runtime.identity.bridgeId, runtime]));

  return {
    apiVersion: FOUNDATION_SURFACE_API_VERSION,
    signal: input.signal,
    runtimes,
    navigation: input.navigation,
    capabilities: {
      forRuntime: (bridgeId) => {
        const runtime = runtimeByBridgeId.get(bridgeId);
        return runtime ? capabilityAdmission(runtime, []) : null;
      },
      admission: (requiredFeatures) =>
        runtimes.map((runtime) => capabilityAdmission(runtime, requiredFeatures)),
    },
    commands: {
      dispatch: async (command) => {
        assertSurfaceAuthority(input.signal);
        const runtime = runtimeForTarget(command.target, runtimeByBridgeId);
        assertCommandAvailable(command, runtime);
        return input.commandOwner.dispatch(command, runtime, input.signal);
      },
    },
    terminals: {
      acquire: (target, options) => {
        assertSurfaceAuthority(input.signal);
        const source = sourceByBridgeId.get(target.identity.bridgeId);
        const runtime = runtimeByBridgeId.get(target.identity.bridgeId);
        if (
          !source ||
          !runtime ||
          runtime.state !== "ready" ||
          !runtime.features.includes("terminal_attach") ||
          !sameRuntimeIdentity(runtime.identity, target.identity)
        ) {
          throw new Error("Terminal runtime generation is unavailable");
        }
        const ownerHandle = terminalSessionOwners.acquire({
          profileId: target.identity.bridgeId,
          // Keep this identical to terminalSessionDescriptor.connectionKey;
          // generationKey already contains the qualified connection identity.
          connectionKey: target.identity.generationKey,
          terminalId: target.nativeTargetId,
          wsUrl: source.wsUrl,
          outputCoalesceMs: options.outputCoalesceMs,
          initialSize: options.initialSize,
          inputEnabled: options.inputEnabled,
          resizeEnabled: options.resizeEnabled,
          scrollEnabled: options.scrollEnabled,
          focusOwner: options.focusOwner,
          onOutput: options.onOutput,
          onState: options.onState,
          onConnectAttempt: options.onConnectAttempt,
        });
        let released = false;
        const release = () => {
          if (released) {
            return;
          }
          released = true;
          input.signal.removeEventListener("abort", release);
          ownerHandle.release();
        };
        input.signal.addEventListener("abort", release, { once: true });
        return {
          updateAdmission: (inputEnabled, resizeEnabled, scrollEnabled) => {
            if (!released) {
              ownerHandle.updateAdmission(inputEnabled, resizeEnabled, scrollEnabled);
            }
          },
          setFocusOwner: (wantsFocus) => {
            if (!released) {
              ownerHandle.setFocusOwner(wantsFocus);
            }
          },
          reportSize: (size) => {
            if (!released) {
              ownerHandle.reportSize(size);
            }
          },
          sendInput: (data, transport) =>
            released ? false : ownerHandle.sendInput(data, transport),
          sendScroll: (lines) => (released ? false : ownerHandle.sendScroll(lines)),
          requestReconnect: () => {
            if (!released) {
              ownerHandle.requestReconnect();
            }
          },
          release,
        };
      },
    },
  };
}

function assertSurfaceAuthority(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("Surface generation is aborted");
  }
}

function runtimeView(runtime: BridgeRuntime): SurfaceRuntimeView {
  return {
    identity: {
      bridgeId: runtime.id,
      connectionKey: runtime.connectionKey,
      generationKey: runtime.generationKey,
    },
    label: runtime.label,
    state: surfaceRuntimeState(runtime),
    features: [...(runtime.capabilities?.features ?? [])],
    commands: [...(runtime.capabilities?.commands ?? [])],
  };
}

function surfaceRuntimeState(runtime: BridgeRuntime): SurfaceRuntimeState {
  if (!runtime.canConnect) {
    return "disabled";
  }
  switch (runtime.capabilityState) {
    case "ready":
      return "ready";
    case "incompatible":
      return "incompatible";
    case "offline":
    case "error":
      return "offline";
    case "idle":
    case "probing":
      return "connecting";
  }
}

function capabilityAdmission(
  runtime: SurfaceRuntimeView,
  requiredFeatures: readonly string[],
): SurfaceCapabilityAdmission {
  const features = new Set(runtime.features);
  return {
    identity: runtime.identity,
    available: runtime.state === "ready" && requiredFeatures.every((feature) => features.has(feature)),
    missingFeatures: requiredFeatures.filter((feature) => !features.has(feature)),
    state: runtime.state,
  };
}

function runtimeForTarget(
  target: SurfaceTarget,
  runtimes: ReadonlyMap<string, SurfaceRuntimeView>,
): SurfaceRuntimeView {
  const runtime = runtimes.get(target.identity.bridgeId);
  if (!runtime || !sameRuntimeIdentity(runtime.identity, target.identity)) {
    throw new Error("Surface target belongs to an unavailable runtime generation");
  }
  return runtime;
}

function sameRuntimeIdentity(
  left: SurfaceRuntimeIdentity,
  right: SurfaceRuntimeIdentity,
): boolean {
  return (
    left.bridgeId === right.bridgeId &&
    left.connectionKey === right.connectionKey &&
    left.generationKey === right.generationKey
  );
}

function assertCommandAvailable(command: SurfaceCommand, runtime: SurfaceRuntimeView): void {
  const requiredCommand =
    command.type === "focusWorkspace"
      ? "workspace.focus"
      : command.type === "focusTab"
        ? "tab.focus"
        : command.type === "focusPane"
          ? "pane.focus"
          : "pane.close";
  if (runtime.state !== "ready" || !runtime.commands.includes(requiredCommand)) {
    throw new Error(`Surface command is unavailable: ${command.type}`);
  }
}
