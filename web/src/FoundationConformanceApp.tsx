import { FoundationConformanceApp as FoundationPackageConformanceApp } from "@herdr-world/foundation/conformance";
import type { FoundationConformanceHost } from "@herdr-world/foundation/conformance";
import { useMemo } from "react";
import { HerdrClientFrame } from "./HerdrClientFrame";
import { CoreNavigationProvider, CoreSurfaceOutlet } from "./CoreNavigation";
import { FederatedRuntimeProvider } from "./federatedRuntime";
import { HostRegistryProvider } from "./hostRegistry";
import { useHostRegistry } from "./hostRegistry";
import { coreSurfaceRegistry } from "./surfaceRegistry";

/** Runnable Foundation-only proof: generic navigation and Spaces, no World assembly. */
export function FoundationConformanceApp() {
  return (
    <HostRegistryProvider>
      <CoreNavigationProvider registry={coreSurfaceRegistry}>
        <FederatedRuntimeProvider>
          <FoundationConformanceShell />
        </FederatedRuntimeProvider>
      </CoreNavigationProvider>
    </HostRegistryProvider>
  );
}

function FoundationConformanceShell() {
  const bridge = useHostRegistry();
  const host = useMemo<FoundationConformanceHost>(
    () => ({
      runtimes: () => bridge.enabledRuntimes.map((runtime) => ({
        bridgeId: runtime.id,
        label: runtime.label,
        generationKey: runtime.generationKey,
        available: runtime.canConnect && runtime.capabilityState === "ready",
        features: runtime.capabilities?.features ?? [],
      })),
      subscribe: () => () => {},
      retry: (bridgeId) => {
        if (bridgeId) {
          bridge.retryBridgeProbe(bridgeId);
        } else {
          for (const runtime of bridge.enabledRuntimes) {
            bridge.retryBridgeProbe(runtime.id);
          }
        }
      },
    }),
    [bridge],
  );
  return (
    <HerdrClientFrame
      style={{}}
      sidebarOpen
      notesOpen={false}
      resizingSidebar={false}
      resizingNotes={false}
      resizingNotesList={false}
      compact={false}
      touch={false}
      detail
      primaryView="spaces"
    >
      <FoundationPackageConformanceApp host={host} />
      <CoreSurfaceOutlet registry={coreSurfaceRegistry} />
    </HerdrClientFrame>
  );
}
