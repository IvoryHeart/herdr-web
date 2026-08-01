import type { ReactNode } from "react";
import { BridgeProvider, useBridge } from "./bridge";
import type { BridgeManager } from "./bridge";
import { hostProfile } from "./hostProfile";
import type { HostProfile } from "./hostProfile";

export function HostRegistryProvider({ children }: { children: ReactNode }) {
  return <BridgeProvider>{children}</BridgeProvider>;
}

export function useHostRegistry(): BridgeManager {
  return useBridge();
}

export function configuredHostProfiles(manager: BridgeManager): HostProfile[] {
  return manager.store.backends.map((backend, displayOrder) =>
    hostProfile(
      backend.id,
      backend.name,
      backend.baseUrl,
      manager.enabledBridgeIds.includes(backend.id),
      displayOrder,
    ),
  );
}
