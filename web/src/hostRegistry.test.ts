import { describe, expect, it } from "vitest";
import {
  hostProfile,
  normalizeHostProfileId,
  normalizeHostProfileLabel,
} from "./hostProfile";

describe("host profile contract", () => {
  it("creates stable schema-v1 browser-owned connection profiles", () => {
    expect(hostProfile("profile-a", "Host A", "http://127.0.0.1:8787", true, 0)).toEqual({
      schemaVersion: 1,
      profileId: "profile-a",
      label: "Host A",
      baseUrl: "http://127.0.0.1:8787",
      enabled: true,
      displayOrder: 0,
    });
  });

  it("bounds opaque IDs, labels, and display order", () => {
    expect(normalizeHostProfileId(" profile-a ")).toBe("profile-a");
    expect(normalizeHostProfileId("bad\nprofile")).toBeNull();
    expect(() => normalizeHostProfileLabel("x".repeat(81), "fallback")).toThrow(/80/iu);
    expect(() => hostProfile("profile-a", "Host A", "http://host-a", true, -1)).toThrow(
      /non-negative/iu,
    );
  });
});
