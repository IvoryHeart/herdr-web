import type { OfficeCoverage } from "./herdrOfficeProjection";

export type OfficeStateNotice = {
  title: string;
  description: string;
  attention: boolean;
};

export function officeStateNotice(coverage: OfficeCoverage): OfficeStateNotice | null {
  if (coverage.configuredHosts === 0) {
    return {
      title: "No host profiles configured",
      description: "Open Settings to add a Herdr bridge profile.",
      attention: true,
    };
  }
  if (coverage.disabledHosts === coverage.configuredHosts) {
    return {
      title: "All host profiles are disabled",
      description: "Enable a Herdr bridge profile in Settings to populate the office.",
      attention: true,
    };
  }
  const enabledHosts = coverage.configuredHosts - coverage.disabledHosts;
  if (coverage.connectingHosts === enabledHosts && coverage.observedHosts === 0) {
    return {
      title: "Connecting to Herdr hosts",
      description: "The office will populate after a validated snapshot is admitted.",
      attention: false,
    };
  }
  if (coverage.observedHosts > 0 && coverage.observedWorkspaces === 0) {
    return {
      title: "No workspaces available",
      description: "Live hosts are connected, but their admitted snapshots contain no workspaces.",
      attention: false,
    };
  }
  if (coverage.observedWorkspaces > 0 && coverage.observedAgents === 0) {
    return {
      title: "No detected agents",
      description: "Workspace rooms remain visible while their admitted panes contain no agents.",
      attention: false,
    };
  }
  const unavailableHosts =
    coverage.staleHosts +
    coverage.incompatibleHosts +
    coverage.disabledHosts +
    coverage.connectingHosts;
  if (unavailableHosts > 0) {
    return {
      title: "Partial host coverage",
      description: "Some configured hosts are stale, incompatible, disabled, or connecting. Live hosts remain usable.",
      attention: true,
    };
  }
  return null;
}
