import { CoreNavigationProvider, CoreSurfaceOutlet } from "./CoreNavigation";
import { coreSurfaceRegistry } from "./surfaceRegistry";

/** Runnable Foundation-only proof: generic navigation and Spaces, no World assembly. */
export function FoundationConformanceApp() {
  return (
    <CoreNavigationProvider registry={coreSurfaceRegistry}>
      <CoreSurfaceOutlet registry={coreSurfaceRegistry} />
    </CoreNavigationProvider>
  );
}
