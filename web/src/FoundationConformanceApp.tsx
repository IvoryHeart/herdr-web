import { FoundationConformanceApp as FoundationPackageConformanceApp } from "@herdr-world/foundation/conformance";
import type { FoundationConformanceHost } from "@herdr-world/foundation/conformance";
import { useMemo } from "react";
import {
  SharedTerminalHandlePool,
} from "@herdr-world/foundation/surfaces";
import type { QualifiedSurfaceTarget } from "@herdr-world/foundation/surfaces";
import { FederatedRuntimeProvider } from "./federatedRuntime";
import { HostRegistryProvider } from "./hostRegistry";
import { useHostRegistry } from "./hostRegistry";
import { useFederatedRuntime } from "./federatedRuntime";
import { createSurfaceTerminalHandle } from "./surfaceTerminal";

/** Runnable Foundation-only proof: generic navigation and Spaces, no World assembly. */
export function FoundationConformanceApp() {
  return (
    <HostRegistryProvider>
      <FederatedRuntimeProvider>
        <FoundationConformanceShell />
      </FederatedRuntimeProvider>
    </HostRegistryProvider>
  );
}

function FoundationConformanceShell() {
  const bridge = useHostRegistry();
  const { connectionStates } = useFederatedRuntime();
  const terminalPool = useMemo(() => new SharedTerminalHandlePool(), []);
  const host = useMemo<FoundationConformanceHost>(
    () => ({
      runtimes: () => bridge.enabledRuntimes.map((runtime) => {
        const state = connectionStates[runtime.id];
        const workspaces = (state?.snapshot?.workspaces ?? []).map((workspace) => {
          const pane = state?.snapshot?.panes.find(
            (candidate) => candidate.workspace_id === workspace.workspace_id && candidate.terminal_id,
          );
          return {
            target: {
              bridgeId: runtime.id,
              kind: "workspace" as const,
              nativeTargetId: workspace.workspace_id,
            },
            label: workspace.label || workspace.workspace_id,
            ...(pane?.terminal_id ? {
              terminalTarget: {
                bridgeId: runtime.id,
                kind: "terminal" as const,
                nativeTargetId: pane.terminal_id,
              },
            } : {}),
          };
        });
        return {
        bridgeId: runtime.id,
        label: runtime.label,
        generationKey: runtime.generationKey,
        available: runtime.canConnect && runtime.capabilityState === "ready",
        features: runtime.capabilities?.features ?? [],
        workspaces,
      };
      }),
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
      navigate: (target: QualifiedSurfaceTarget) => {
        bridge.markBridgeUsed(target.bridgeId);
      },
      acquireTerminal: async (target: QualifiedSurfaceTarget) => {
        const runtime = bridge.getRuntime(target.bridgeId);
        if (!runtime) {
          throw new Error("Bridge is unavailable");
        }
        return terminalPool.acquire(
          target,
          async (qualifiedTarget) => createSurfaceTerminalHandle(runtime, qualifiedTarget),
        );
      },
    }),
    [bridge, connectionStates, terminalPool],
  );
  return <FoundationPackageConformanceApp host={host} />;
}
