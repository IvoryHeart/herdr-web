import { describe, expect, it } from "vitest";
import type { OfficeCoverage } from "./herdrOfficeProjection";
import { officeStateNotice } from "./worldState";

describe("World bounded state notices", () => {
  it.each([
    [coverage({ configuredHosts: 0 }), "No host profiles configured"],
    [coverage({ configuredHosts: 2, disabledHosts: 2 }), "All host profiles are disabled"],
    [coverage({ configuredHosts: 2, connectingHosts: 2 }), "Connecting to Herdr hosts"],
    [coverage({ configuredHosts: 1, observedHosts: 1 }), "No workspaces available"],
    [
      coverage({ configuredHosts: 1, observedHosts: 1, observedWorkspaces: 2 }),
      "No detected agents",
    ],
    [
      coverage({
        configuredHosts: 2,
        observedHosts: 2,
        observedWorkspaces: 2,
        observedAgents: 1,
        staleHosts: 1,
      }),
      "Partial host coverage",
    ],
  ])("reports %s", (input, title) => {
    expect(officeStateNotice(input)).toMatchObject({ title });
  });

  it("stays silent for complete live coverage", () => {
    expect(officeStateNotice(coverage({
      configuredHosts: 1,
      observedHosts: 1,
      observedWorkspaces: 1,
      observedAgents: 1,
    }))).toBeNull();
  });
});

function coverage(overrides: Partial<OfficeCoverage>): OfficeCoverage {
  return {
    configuredHosts: 0,
    observedHosts: 0,
    compatibleHosts: 0,
    connectingHosts: 0,
    staleHosts: 0,
    incompatibleHosts: 0,
    disabledHosts: 0,
    observedWorkspaces: 0,
    observedDesks: 0,
    observedAgents: 0,
    status: { working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 },
    omittedRooms: 0,
    omittedDesks: 0,
    omittedRoomAgents: 0,
    omittedReceptionDesks: 0,
    omittedWaitingAgents: 0,
    omittedBarAgents: 0,
    ...overrides,
  };
}
