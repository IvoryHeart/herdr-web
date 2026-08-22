import type { BridgeRuntime } from "./bridge";
import type { BridgeHttpUrl } from "./bridgeApi";
import bridgeCapabilityManifest from "../../contracts/bridge-capabilities.json";
import { terminalSessionOwners } from "./terminalSessionOwner";
import type { TerminalSessionHandle } from "./terminalSessionOwner";
import {
  createOpaqueProductSettingsLifecycle,
  createOpaqueSurfaceLifecycle,
} from "./surfaceLifecycle";
import type {
  OpaqueProductSettingsLifecycle,
  OpaqueSurfaceLifecycle,
  SurfaceLifecycleOptions,
} from "./surfaceLifecycle";
import {
  productSettingsContributionTokenBrand,
  surfaceRegistrationTokenBrand,
  FOUNDATION_SURFACE_API_VERSION,
} from "./surfaceTypes";
import type {
  ProductAssembly,
  ProductAssemblyInput,
  ProductSettingsContribution,
  ProductSettingsContributionToken,
  SurfaceCapabilityAdmission,
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceDefinition,
  SurfaceDefinitionInput,
  SurfaceHostV1,
  SurfaceRegistration,
  SurfaceRegistrationToken,
  SurfaceRoute,
  SurfaceRuntimeIdentity,
  SurfaceRuntimeState,
  SurfaceRuntimeView,
  SurfaceTarget,
} from "./surfaceTypes";

export { FOUNDATION_SURFACE_API_VERSION } from "./surfaceTypes";
export type {
  ProductAssembly,
  ProductAssemblyInput,
  ProductSettingsContribution,
  ProductSettingsContributionToken,
  SurfaceCapabilityAdmission,
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceComponent,
  SurfaceDefinition,
  SurfaceDefinitionInput,
  SurfaceHostV1,
  SurfaceRegistration,
  SurfaceRegistrationToken,
  SurfaceRoute,
  SurfaceRuntimeIdentity,
  SurfaceRuntimeState,
  SurfaceRuntimeView,
  SurfaceTarget,
  SurfaceTerminalAcquireOptions,
  SurfaceTerminalHandle,
} from "./surfaceTypes";

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
  const knownFeatures = new Set<string>(bridgeCapabilityManifest.features);
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
  readonly [surfaceRegistrationTokenBrand] = "surface-registration-token" as const;
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

export function defineSurface<Context>(
  registration: SurfaceRegistration<Context>,
): SurfaceRegistrationToken {
  return OpaqueSurfaceRegistration.from(registration);
}

export function createSurfaceLifecycleFromToken(
  token: SurfaceRegistrationToken,
  options: SurfaceLifecycleOptions,
): OpaqueSurfaceLifecycle {
  return requireSurfaceRegistrationToken(token).createLifecycle(options);
}

class OpaqueProductSettingsContribution {
  readonly id: string;
  readonly label: string;
  readonly [productSettingsContributionTokenBrand] =
    "product-settings-contribution-token" as const;
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

export function createProductSettingsLifecycleFromToken(
  token: ProductSettingsContributionToken,
  options: SurfaceLifecycleOptions,
): OpaqueProductSettingsLifecycle {
  return requireProductSettingsToken(token).createLifecycle(options);
}

export function validateProductAssembly(
  assembly: ProductAssemblyInput,
): asserts assembly is ProductAssembly {
  assertFoundationSurfaceApiVersion(assembly.surfaceApiVersion);
  if (assembly.surfaces.length === 0) {
    throw new Error("Surface assembly must register at least one surface");
  }
  const ids = new Set<string>();
  const routes = new Map<string, string>();
  for (const candidate of assembly.surfaces) {
    const surface = requireSurfaceRegistrationToken(candidate);
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
  if (assembly.productSettings !== undefined) {
    requireProductSettingsToken(assembly.productSettings);
  }
}

export function createProductAssembly(input: ProductAssembly): ProductAssembly {
  validateProductAssembly(input);
  return input;
}

function requireSurfaceRegistrationToken(value: unknown): OpaqueSurfaceRegistration {
  if (!(value instanceof OpaqueSurfaceRegistration)) {
    throw new Error("Invalid surface registration token");
  }
  return value;
}

function requireProductSettingsToken(value: unknown): OpaqueProductSettingsContribution {
  if (!(value instanceof OpaqueProductSettingsContribution)) {
    throw new Error("Invalid product settings contribution token");
  }
  return value;
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
        let ownerHandle: TerminalSessionHandle | null = null;
        let released = false;
        const release = () => {
          if (released && !ownerHandle) {
            return;
          }
          released = true;
          input.signal.removeEventListener("abort", release);
          const handle = ownerHandle;
          ownerHandle = null;
          handle?.release();
        };
        input.signal.addEventListener("abort", release, { once: true });
        try {
          ownerHandle = terminalSessionOwners.acquire({
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
        } catch (error) {
          release();
          throw error;
        }
        if (input.signal.aborted) {
          release();
          throw new Error("Surface generation is aborted");
        }
        const handle = ownerHandle;
        if (!handle) {
          release();
          throw new Error("Terminal acquisition did not produce a handle");
        }
        return {
          updateAdmission: (inputEnabled, resizeEnabled, scrollEnabled) => {
            if (!released) {
              handle.updateAdmission(inputEnabled, resizeEnabled, scrollEnabled);
            }
          },
          setFocusOwner: (wantsFocus) => {
            if (!released) {
              handle.setFocusOwner(wantsFocus);
            }
          },
          reportSize: (size) => {
            if (!released) {
              handle.reportSize(size);
            }
          },
          sendInput: (data, transport) =>
            released ? false : handle.sendInput(data, transport),
          sendScroll: (lines) => (released ? false : handle.sendScroll(lines)),
          requestReconnect: () => {
            if (!released) {
              handle.requestReconnect();
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
