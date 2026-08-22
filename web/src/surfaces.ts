import {
  assertFoundationSurfaceApiVersion as assertInternalApiVersion,
  createProductAssembly as createInternalProductAssembly,
  defineProductSettingsContribution as defineInternalProductSettingsContribution,
  defineSurface as defineInternalSurface,
  validateProductAssembly as validateInternalProductAssembly,
  validateSurfaceDefinition as validateInternalSurfaceDefinition,
} from "./surfaceContract";
import { FOUNDATION_SURFACE_API_VERSION } from "./surfaceTypes";
import type {
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
  SurfaceTargetKind,
  SurfaceTerminalAcquireOptions,
  SurfaceTerminalConnectionState,
  SurfaceTerminalHandle,
  SurfaceTerminalInputTransport,
  SurfaceTerminalSize,
  SurfaceTerminalState,
} from "./surfaceTypes";

export { FOUNDATION_SURFACE_API_VERSION };

export function assertFoundationSurfaceApiVersion(
  observed: number | null | undefined,
): asserts observed is typeof FOUNDATION_SURFACE_API_VERSION {
  assertInternalApiVersion(observed);
}

export function validateSurfaceDefinition(input: SurfaceDefinitionInput): SurfaceDefinition {
  return validateInternalSurfaceDefinition(input);
}

export function defineSurface<Context>(
  registration: SurfaceRegistration<Context>,
): SurfaceRegistrationToken {
  return defineInternalSurface(registration);
}

export function defineProductSettingsContribution<Context>(
  contribution: ProductSettingsContribution<Context>,
): ProductSettingsContributionToken {
  return defineInternalProductSettingsContribution(contribution);
}

export function validateProductAssembly(
  assembly: ProductAssemblyInput,
): asserts assembly is ProductAssembly {
  validateInternalProductAssembly(assembly);
}

export function createProductAssembly(input: ProductAssembly): ProductAssembly {
  return createInternalProductAssembly(input);
}

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
  SurfaceTargetKind,
  SurfaceTerminalAcquireOptions,
  SurfaceTerminalConnectionState,
  SurfaceTerminalHandle,
  SurfaceTerminalInputTransport,
  SurfaceTerminalSize,
  SurfaceTerminalState,
};

/**
 * Public surface-contract entry point for the future Foundation package
 * subpath. Host factories, runtime sources, owner keys, and lifecycle
 * machinery remain internal to the current integration repository.
 */
