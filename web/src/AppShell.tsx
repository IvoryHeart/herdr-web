import { App } from "./App";
import { CoreNavigationProvider } from "./CoreNavigation";
import { FederatedRuntimeProvider } from "./federatedRuntime";
import { HostRegistryProvider } from "./hostRegistry";
import { productSurfaceRegistry } from "./productAssembly";

export function AppShell() {
  return (
    <HostRegistryProvider>
      <CoreNavigationProvider registry={productSurfaceRegistry}>
        <FederatedRuntimeProvider>
          <App />
        </FederatedRuntimeProvider>
      </CoreNavigationProvider>
    </HostRegistryProvider>
  );
}
