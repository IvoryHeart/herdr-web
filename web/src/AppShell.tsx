import { CoreNavigationProvider, CoreSurfaceOutlet } from "./CoreNavigation";
import { HostRegistryProvider } from "./hostRegistry";
import { coreSurfaceRegistry } from "./surfaceRegistry";

export function AppShell() {
  return (
    <HostRegistryProvider>
      <CoreNavigationProvider registry={coreSurfaceRegistry}>
        <CoreSurfaceOutlet registry={coreSurfaceRegistry} />
      </CoreNavigationProvider>
    </HostRegistryProvider>
  );
}
