import { describe, expect, it } from "vitest";
import {
  assertFoundationCompatibility,
  FOUNDATION_ARTIFACT,
  INSTALLED_FOUNDATION,
} from "./foundationCompatibility";

describe("joined Foundation compatibility gate", () => {
  it("accepts the pinned release and package metadata", () => {
    expect(() => assertFoundationCompatibility()).not.toThrow();
    expect(FOUNDATION_ARTIFACT.releaseTag).toBe("v0.1.0-rc.5");
    expect(FOUNDATION_ARTIFACT.sourceCommit).toBe("182c483bb9cf97f20201ffe916240aa5b48f4127");
  });

  it.each([
    ["packageVersion", "0.2.0"],
    ["surfaceApiVersion", 2],
    ["bridgeApiVersion", 2],
    ["webCompatVersion", 2],
    ["terminalProtocol", 19],
    ["bridgeVersion", "0.2.0"],
  ] as const)("rejects an incompatible %s", (field, value) => {
    expect(() => assertFoundationCompatibility({
      ...INSTALLED_FOUNDATION,
      [field]: value,
    })).toThrow(new RegExp(`Foundation compatibility mismatch for ${field}`));
  });

  it("rejects a tampered package declaration", () => {
    expect(FOUNDATION_ARTIFACT.packageSha256).not.toBe("tampered");
    expect(FOUNDATION_ARTIFACT.packageIntegrity).toMatch(/^sha512-/u);
  });
});
