/**
 * Public surface-contract entry point for the future Foundation package
 * subpath. The current App still mounts through its characterization registry;
 * this facade is exercised by the contract/lifecycle conformance tests.
 */
export * from "./surfaceContract";
export {
  LifecycleKernel,
  type LifecycleCloseReason,
  type LifecycleErrorInfo,
  type LifecycleErrorKind,
  type LifecycleErrorReporter,
  type LifecycleRegistration,
  type LifecycleMounted,
  type LifecycleResult,
  type OpaqueMountResult,
  type OpaqueProductSettingsLifecycle,
  type OpaqueSurfaceLifecycle,
  type SurfaceLifecycleOptions,
} from "./surfaceLifecycle";
