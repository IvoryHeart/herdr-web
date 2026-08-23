#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const artifactRoot = path.resolve(
  process.env.HERDR_WORLD_FOUNDATION_ARTIFACT_DIR ?? path.join(root, "vendor", "foundation"),
);
const packagePath = path.join(artifactRoot, "herdr-world-foundation-0.1.0.tgz");
const packageHashPath = `${packagePath}.sha256`;
const packageIntegrityPath = `${packagePath}.integrity`;
const manifestPath = path.join(artifactRoot, "manifest.json");
const manifestHashPath = `${manifestPath}.sha256`;
const archivePath = path.join(
  artifactRoot,
  "herdr-world-foundation-candidate-a6104b683963651d60a061cfcbd91d9fdc5effde.tar.gz",
);
const archiveHashPath = `${archivePath}.sha256`;

function fail(message) {
  throw new Error(`Foundation artifact verification failed: ${message}`);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha512Integrity(filePath) {
  return `sha512-${createHash("sha512").update(readFileSync(filePath)).digest("base64")}`;
}

function declaredHash(filePath) {
  const [digest, declaredName] = readFileSync(filePath, "utf8").trim().split(/\s+/u);
  if (!digest || !declaredName) fail(`invalid checksum file ${path.relative(root, filePath)}`);
  return { digest, declaredName };
}

function verifyHash(filePath, checksumPath) {
  const { digest, declaredName } = declaredHash(checksumPath);
  if (path.basename(filePath) !== declaredName) {
    fail(`${path.relative(root, checksumPath)} names ${declaredName}, not ${path.basename(filePath)}`);
  }
  const actual = sha256(filePath);
  if (actual !== digest) {
    fail(`${path.relative(root, filePath)} has SHA-256 ${actual}, expected ${digest}`);
  }
}

function verifyLedger(directory) {
  const ledgerPath = path.join(directory, "SHA256SUMS");
  const lines = readFileSync(ledgerPath, "utf8").trim().split(/\r?\n/u).filter(Boolean);
  const seen = new Set();
  for (const line of lines) {
    const match = /^(?<digest>[0-9a-f]{64})  (?<relative>.+)$/u.exec(line);
    if (!match) fail(`invalid SHA256SUMS entry: ${line}`);
    const relative = match.groups.relative;
    if (seen.has(relative)) fail(`duplicate SHA256SUMS entry: ${relative}`);
    seen.add(relative);
    const memberPath = path.join(directory, relative);
    if (!existsSync(memberPath)) fail(`SHA256SUMS member is missing: ${relative}`);
    const actual = sha256(memberPath);
    if (actual !== match.groups.digest) fail(`SHA256SUMS mismatch for ${relative}`);
  }
  return lines.length;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.source?.repository !== "IvoryHeart/herdr-world-foundation") {
  fail("manifest source repository is not IvoryHeart/herdr-world-foundation");
}
if (manifest.source?.commit !== "a6104b683963651d60a061cfcbd91d9fdc5effde") {
  fail("manifest source commit is not the reviewed candidate commit");
}
if (manifest.foundation?.packageName !== "@herdr-world/foundation") {
  fail("manifest package name is not @herdr-world/foundation");
}
if (manifest.foundation?.version !== "0.1.0") {
  fail("manifest package version is not 0.1.0");
}
if (manifest.foundation?.surfaceApiVersion !== 1) fail("Surface API is not 1");
if (manifest.bridge?.version !== "0.1.0") fail("bridge version is not 0.1.0");
if (manifest.compatibility?.bridgeApiVersion !== 1) fail("bridge API is not 1");
if (manifest.compatibility?.webCompatVersion !== 1) fail("webCompat is not 1");
if (manifest.compatibility?.supportedHerdrVersion !== "0.8.2") fail("Herdr version is not 0.8.2");
if (manifest.compatibility?.terminalProtocol !== 20) fail("terminal protocol is not 20");
if (!Array.isArray(manifest.packageContentInventory) || manifest.packageContentInventory.length === 0) {
  fail("package content inventory is missing");
}
if (typeof manifest.dependencyInventory?.npmProduction !== "string"
  || typeof manifest.dependencyInventory?.cargo !== "string"
  || typeof manifest.dependencyInventory?.licenseNotices !== "string") {
  fail("dependency or license inventory is incomplete");
}
if (!Array.isArray(manifest.provenance?.members) || manifest.provenance.members.length === 0) {
  fail("provenance member inventory is missing");
}

verifyHash(manifestPath, manifestHashPath);
verifyHash(packagePath, packageHashPath);
if (sha512Integrity(packagePath) !== readFileSync(packageIntegrityPath, "utf8").trim()) {
  fail("npm integrity does not match the package bytes");
}
verifyHash(archivePath, archiveHashPath);
if (manifest.foundation.npmTarball.sha256 !== sha256(packagePath)) {
  fail("manifest package SHA-256 does not match the checked-in package");
}
if (manifest.foundation.npmTarball.integrity !== sha512Integrity(packagePath)) {
  fail("manifest package integrity does not match the checked-in package");
}

const extracted = mkdtempSync(path.join(tmpdir(), "herdr-world-foundation-"));
try {
  execFileSync("tar", ["-xzf", archivePath, "-C", extracted], { stdio: "ignore" });
  const archivedManifest = readFileSync(path.join(extracted, "manifest.json"), "utf8");
  if (archivedManifest !== readFileSync(manifestPath, "utf8")) {
    fail("release archive manifest differs from the checked-in manifest");
  }
  const archivedPackage = path.join(extracted, "package", manifest.foundation.npmTarball.filename);
  if (sha256(archivedPackage) !== sha256(packagePath)) {
    fail("release archive package differs from the checked-in package");
  }
  const archivedBridge = path.join(extracted, "bridge", manifest.bridge.filename);
  if (!existsSync(archivedBridge) || sha256(archivedBridge) !== manifest.bridge.sha256) {
    fail("release archive bridge differs from the declared bridge SHA-256");
  }
  for (const relative of Object.values(manifest.dependencyInventory)) {
    if (typeof relative !== "string" || !existsSync(path.join(extracted, relative))) {
      fail(`declared dependency inventory is missing: ${String(relative)}`);
    }
  }
  const ledgerEntries = verifyLedger(extracted);
  console.log(JSON.stringify({
    package: manifest.foundation.packageName,
    version: manifest.foundation.version,
    sourceCommit: manifest.source.commit,
    packageSha256: sha256(packagePath),
    packageIntegrity: sha512Integrity(packagePath),
    bridgeSha256: manifest.bridge.sha256,
    surfaceApi: manifest.foundation.surfaceApiVersion,
    bridgeApi: manifest.compatibility.bridgeApiVersion,
    webCompat: manifest.compatibility.webCompatVersion,
    herdr: manifest.compatibility.supportedHerdrVersion,
    terminalProtocol: manifest.compatibility.terminalProtocol,
    releaseTag: "v0.1.0-rc.1",
    releaseUrl: "https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.1",
    releaseArchiveSha256: sha256(archivePath),
    ledgerEntries,
  }, null, 2));
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
