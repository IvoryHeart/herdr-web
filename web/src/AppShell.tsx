import { App } from "./App";
import { CoreNavigationProvider } from "./CoreNavigation";
import { FederatedRuntimeProvider } from "./federatedRuntime";
import { HostRegistryProvider } from "./hostRegistry";
import { coreSurfaceRegistry } from "./surfaceRegistry";

export function AppShell() {
  return (
    <HostRegistryProvider>
      <CoreNavigationProvider registry={coreSurfaceRegistry}>
        <FederatedRuntimeProvider>
          <App />
        </FederatedRuntimeProvider>
      </CoreNavigationProvider>
    </HostRegistryProvider>
  );
}
