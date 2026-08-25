import {
  FOUNDATION_EXTENSION_FEATURE,
} from "@herdr-world/foundation/surfaces";
import type {
  SurfaceHostV1,
  SurfaceRuntimeFacts,
  SurfaceRuntimeIdentity,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import {
  parseObservabilityExtensionResponse,
  type ObservabilityExtensionResponse,
} from "../observability";
import type { HostProfile } from "../hostProfile";
import type { HostConnectionState } from "../runtimeClient";
import type { QualifiedTarget } from "../runtimeIdentity";
import type {
  AgentStatus,
  PaneInfo,
  Snapshot,
  TabInfo,
  WorkspaceInfo,
} from "../types";
import {
  aggregateOfficeObservability,
  type OfficeObservability,
} from "./officeObservability";
import type { HerdrOfficeSourceHost, OfficeHostLocation } from "./herdrOfficeProjection";

export type FoundationWorldSource = HerdrOfficeSourceHost & {
  runtime: SurfaceRuntimeView;
  facts: SurfaceRuntimeFacts | null;
};

export function foundationWorldSources(host: SurfaceHostV1): FoundationWorldSource[] {
  const enabled = new Set(host.runtimes.map(({ identity }) => identity.bridgeId));
  const selectedBridgeId = host.selectedRuntime?.identity.bridgeId ?? null;
  return host.availableRuntimes.flatMap((runtime, displayOrder) => {
    if (
      host.shell.state.runtimeScope === "selected" &&
      runtime.identity.bridgeId !== selectedBridgeId
    ) {
      return [];
    }
    const facts = host.facts.forRuntime(runtime.identity.bridgeId);
    return [{
      profile: foundationHostProfile(runtime, enabled.has(runtime.identity.bridgeId), displayOrder),
      location: foundationHostLocation(runtime.identity.bridgeId),
      connectionState: foundationConnectionState(runtime),
      generationKey: facts?.identity.generationKey ?? null,
      features: runtime.features,
      snapshot: facts ? foundationSnapshot(facts) : null,
      runtime,
      facts,
    }];
  });
}

function foundationHostProfile(
  runtime: SurfaceRuntimeView,
  enabled: boolean,
  displayOrder: number,
): HostProfile {
  return {
    schemaVersion: 1,
    profileId: runtime.identity.bridgeId,
    label: runtime.label,
    // World never receives or reconstructs bridge URLs. This legacy shape is
    // retained only as an adapter for the World projection's stable model.
    baseUrl: "",
    enabled,
    displayOrder,
  };
}

function foundationHostLocation(bridgeId: string): OfficeHostLocation {
  return bridgeId === "same-origin" ? "local" : "remote";
}

function foundationConnectionState(runtime: SurfaceRuntimeView): HostConnectionState {
  switch (runtime.state) {
    case "disabled":
      return "disabled";
    case "connecting":
      return "connecting";
    case "ready":
      return "compatible";
    case "degraded":
      return "degraded";
    case "incompatible":
      return "incompatible";
    case "offline":
      return "offline";
  }
}

function foundationSnapshot(facts: SurfaceRuntimeFacts): Snapshot {
  const workspaces: WorkspaceInfo[] = facts.workspaces.map((workspace) => ({
    workspace_id: workspace.workspaceId,
    number: workspace.number,
    label: workspace.label,
    focused: workspace.focused,
    pane_count: workspace.paneCount,
    tab_count: workspace.tabCount,
    active_tab_id: workspace.activeTabId ?? "",
    agent_status: "unknown",
  }));
  const tabs: TabInfo[] = facts.tabs.map((tab) => ({
    tab_id: tab.tabId,
    workspace_id: tab.workspaceId,
    number: tab.number,
    label: tab.label,
    focused: tab.focused,
    pane_count: tab.paneCount,
    agent_status: "unknown",
  }));
  const panes: PaneInfo[] = facts.panes.map((pane) => ({
    pane_id: pane.paneId,
    terminal_id: pane.terminalId,
    workspace_id: pane.workspaceId,
    tab_id: pane.tabId,
    focused: pane.focused,
    label: pane.label,
    agent: pane.agent ?? undefined,
    display_agent: pane.displayAgent ?? undefined,
    task_summary: pane.taskSummary ?? undefined,
    agent_status: agentStatus(pane.agentStatus),
    state_labels: { ...pane.stateLabels },
    revision: 0,
  }));
  return {
    workspaces,
    tabs,
    panes,
    layouts: [],
    selected_pane_id: facts.selection?.pane.nativeTargetId ?? null,
  };
}

function agentStatus(value: string): AgentStatus {
  return value === "idle" || value === "working" || value === "blocked" || value === "done"
    ? value
    : "unknown";
}

export function foundationRuntime(
  host: SurfaceHostV1,
  bridgeId: string,
  generationKey?: string,
): SurfaceRuntimeView | null {
  const runtime = host.availableRuntimes.find(({ identity }) => identity.bridgeId === bridgeId) ?? null;
  if (!runtime || (generationKey !== undefined && runtime.identity.generationKey !== generationKey)) {
    return null;
  }
  return runtime;
}

export function foundationIdentity(
  host: SurfaceHostV1,
  target: QualifiedTarget,
  generationKey: string,
): SurfaceRuntimeIdentity | null {
  const runtime = foundationRuntime(host, target.profileId, generationKey);
  return runtime?.identity ?? null;
}

export function foundationPane(
  host: SurfaceHostV1,
  bridgeId: string,
  paneId: string,
  generationKey?: string,
) {
  const runtime = foundationRuntime(host, bridgeId, generationKey);
  if (!runtime) return null;
  const facts = host.facts.forRuntime(bridgeId);
  return facts && sameRuntimeIdentity(facts.identity, runtime.identity)
    ? facts.panes.find((pane) => pane.paneId === paneId) ?? null
    : null;
}

function sameRuntimeIdentity(
  left: SurfaceRuntimeIdentity,
  right: SurfaceRuntimeIdentity,
) {
  return left.bridgeId === right.bridgeId &&
    left.connectionKey === right.connectionKey &&
    left.generationKey === right.generationKey;
}

export function foundationOfficeObservability(
  host: SurfaceHostV1,
  signal: AbortSignal = host.signal,
): Promise<OfficeObservability> {
  const candidates = host.runtimes.filter((runtime) =>
    (runtime.state === "ready" || runtime.state === "degraded") &&
    runtime.features.includes(FOUNDATION_EXTENSION_FEATURE),
  );
  if (candidates.length === 0) {
    return Promise.resolve({
      health: "unavailable",
      providerId: null,
      sourceCount: 0,
      configuredSourceCount: 0,
      failedSourceCount: 0,
      observedAt: 0,
      windowSeconds: null,
      models: [],
      totalCostUsd: null,
      totalUsage: 0,
    });
  }
  return Promise.allSettled(candidates.map(async (runtime) => {
    if (signal.aborted) throw new DOMException("Surface generation disposed", "AbortError");
    const [descriptor, snapshot] = await Promise.all([
      host.extensions.request({
        runtime: runtime.identity,
        extensionId: "observability",
        operation: "descriptor",
      }),
      host.extensions.request({
        runtime: runtime.identity,
        extensionId: "observability",
        operation: "snapshot",
      }),
    ]);
    if (signal.aborted) throw new DOMException("Surface generation disposed", "AbortError");
    return parseObservabilityExtensionResponse({ descriptor, snapshot } satisfies {
      descriptor: unknown;
      snapshot: unknown;
    });
  })).then((results) => aggregateOfficeObservability(results.map((result) =>
    result.status === "fulfilled"
      ? { response: result.value as ObservabilityExtensionResponse }
      : { failed: true },
  )));
}

export function foundationConnectionLabel(runtime: SurfaceRuntimeView | null) {
  if (!runtime) return "Bridge unavailable";
  return runtime.label;
}
