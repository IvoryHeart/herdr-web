import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { BridgeProvider, useBridge } from "./bridge";
import type { BridgeManager } from "./bridge";
import { hostProfile } from "./hostProfile";
import type { HostProfile } from "./hostProfile";
import { routeQualifiedTarget, RuntimeRouteError } from "./runtimeIdentity";
import type { QualifiedTarget } from "./runtimeIdentity";

export type HostRegistry = BridgeManager & {
  profiles: readonly HostProfile[];
  routeTarget: (
    target: QualifiedTarget,
    requiredCommand?: string,
    isAdmitted?: (profileId: string) => boolean,
  ) => ReturnType<typeof routeQualifiedTarget>;
};

const HostRegistryContext = createContext<HostRegistry | null>(null);

export function HostRegistryProvider({ children }: { children: ReactNode }) {
  return (
    <BridgeProvider>
      <HostRegistryBoundary>{children}</HostRegistryBoundary>
    </BridgeProvider>
  );
}

function HostRegistryBoundary({ children }: { children: ReactNode }) {
  const manager = useBridge();
  const profiles = useMemo(() => configuredHostProfiles(manager), [manager]);
  const value = useMemo<HostRegistry>(
    () => ({
      ...manager,
      profiles,
      routeTarget: (target, requiredCommand, isAdmitted) => {
        if (isAdmitted && !isAdmitted(target.profileId)) {
          throw new RuntimeRouteError("host_unavailable", "Target host has no fresh admitted state");
        }
        return routeQualifiedTarget(target, manager.enabledRuntimes, requiredCommand);
      },
    }),
    [manager, profiles],
  );
  return <HostRegistryContext.Provider value={value}>{children}</HostRegistryContext.Provider>;
}

export function useHostRegistry(): HostRegistry {
  const value = useContext(HostRegistryContext);
  if (!value) {
    throw new Error("useHostRegistry must be used inside HostRegistryProvider");
  }
  return value;
}

export function configuredHostProfiles(manager: BridgeManager): HostProfile[] {
  return manager.availableRuntimes.map((runtime, displayOrder) =>
    hostProfile(
      runtime.id,
      runtime.label,
      runtime.backend?.baseUrl ?? globalThis.location?.origin ?? "same-origin",
      manager.enabledBridgeIds.includes(runtime.id),
      displayOrder,
    ),
  );
}
