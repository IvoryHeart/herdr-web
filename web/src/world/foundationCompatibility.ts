import foundationPackage from "@herdr-world/foundation/package.json";
import foundationCompatibility from "@herdr-world/foundation/compatibility.json";

export const FOUNDATION_ARTIFACT = Object.freeze({
  packageName: "@herdr-world/foundation",
  packageVersion: "0.1.0",
  sourceRepository: "IvoryHeart/herdr-world-foundation",
  sourceCommit: "a6104b683963651d60a061cfcbd91d9fdc5effde",
  releaseTag: "v0.1.0-rc.1",
  releaseUrl: "https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.1",
  packageSha256: "aaa33b18330cf2101dae754b3facc99b529c9d4196d6098cd74d57a84954e699",
  packageIntegrity:
    "sha512-OuCHH4Wfk5p2mflZdlBRFDYrHVNuIB1Ec2+C0BfkLD8a5EFsVF5LzFBoNDFpQRrg1UX2DxgZ/ewh8mQyuxPumg==",
  bridgeVersion: "0.1.0",
  bridgeSha256: "a8041e7e6d888678185c0c934f5a0f9162cb43fe84b54e8c1f468aaa6431b7fa",
  surfaceApiVersion: 1,
  bridgeApiVersion: 1,
  webCompatVersion: 1,
  herdrVersion: "0.8.2",
  herdrCommit: "9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c",
  terminalProtocol: 20,
} as const);

export type FoundationCompatibilityInput = {
  packageName: string;
  packageVersion: string;
  surfaceApiVersion: number;
  bridgeVersion: string;
  bridgeApiVersion: number;
  webCompatVersion: number;
  herdrVersion: string;
  herdrCommit: string;
  terminalProtocol: number;
};

export const INSTALLED_FOUNDATION: FoundationCompatibilityInput = {
  packageName: foundationPackage.name,
  packageVersion: foundationPackage.version,
  surfaceApiVersion: foundationCompatibility.surfaceApiVersion,
  bridgeVersion: foundationCompatibility.bridge.binaryVersion,
  bridgeApiVersion: foundationCompatibility.bridge.apiVersion,
  webCompatVersion: foundationCompatibility.bridge.webCompat,
  herdrVersion: foundationCompatibility.supportedHerdr.testedVersion,
  herdrCommit: foundationCompatibility.supportedHerdr.commit,
  terminalProtocol: foundationCompatibility.terminalProtocol,
};

const COMPATIBILITY_FIELDS = [
  "packageName",
  "packageVersion",
  "surfaceApiVersion",
  "bridgeVersion",
  "bridgeApiVersion",
  "webCompatVersion",
  "herdrVersion",
  "herdrCommit",
  "terminalProtocol",
] as const;

export function assertFoundationCompatibility(
  observed: FoundationCompatibilityInput = INSTALLED_FOUNDATION,
): void {
  for (const field of COMPATIBILITY_FIELDS) {
    const expected = FOUNDATION_ARTIFACT[field];
    const actual = observed[field];
    if (actual !== expected) {
      throw new Error(
        `Foundation compatibility mismatch for ${field}: expected ${String(expected)}, observed ${String(actual)}`,
      );
    }
  }
}
