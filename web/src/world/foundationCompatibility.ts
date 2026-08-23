import foundationPackage from "@herdr-world/foundation/package.json";
import foundationCompatibility from "@herdr-world/foundation/compatibility.json";

export const FOUNDATION_ARTIFACT = Object.freeze({
  packageName: "@herdr-world/foundation",
  packageVersion: "0.1.0",
  sourceRepository: "IvoryHeart/herdr-world-foundation",
  sourceCommit: "182c483bb9cf97f20201ffe916240aa5b48f4127",
  releaseTag: "v0.1.0-rc.5",
  releaseUrl: "https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.5",
  packageSha256: "43450ccde2ab925f932fbfaa29ab8ccb097f3f650a5007b63facb7e33e98e751",
  packageIntegrity:
    "sha512-8JbRaIhc8cT554mnHPirldl03D7OtOLTnuhvdZSOHPkCn/pK1HbEiBpTNv4ATouV8/z7MEkPSJL5rXzeMM9gGA==",
  bridgeVersion: "0.1.0",
  bridgeSha256: "8748cd78a06a10842a190c4af9f040c0e2b8f2c67b772abb6a0ac65fb267b029",
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
