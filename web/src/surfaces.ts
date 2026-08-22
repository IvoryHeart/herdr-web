export {
  FOUNDATION_SURFACE_API_VERSION,
  assertFoundationSurfaceApiVersion,
  createProductAssembly,
  defineProductSettingsContribution,
  defineSurface,
  validateProductAssembly,
  validateSurfaceDefinition,
} from "./surfaceContract";
export type {
  ProductAssembly,
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
  SurfaceTerminalHandle,
} from "./surfaceContract";

/**
 * Public surface-contract entry point for the future Foundation package
 * subpath. Host factories, runtime sources, owner keys, and lifecycle
 * machinery remain internal to the current integration repository.
 */
