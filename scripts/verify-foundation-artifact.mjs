#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
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
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const foundationSourceCommit = manifest.source?.commit;
const foundationReleaseTag = "v0.1.0-rc.5";
const foundationReleaseUrl = `https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/${foundationReleaseTag}`;
const archivePath = path.join(
  artifactRoot,
  `herdr-world-foundation-candidate-${foundationSourceCommit}.tar.gz`,
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

function verifyLedger(directory, actualFiles, expectedFiles) {
  const ledgerPath = path.join(directory, "SHA256SUMS");
  const entries = new Map();
  for (const line of readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean)) {
    const match = /^(?<digest>[0-9a-f]{64})  (?<relative>.+)$/u.exec(line);
    if (!match) fail(`invalid SHA256SUMS entry: ${line}`);
    const relative = match.groups.relative;
    if (path.posix.normalize(relative) !== relative || relative.startsWith("../") || relative.includes("\\")) {
      fail(`invalid SHA256SUMS member path: ${relative}`);
    }
    if (entries.has(relative)) fail(`duplicate SHA256SUMS entry: ${relative}`);
    entries.set(relative, match.groups.digest);
  }
  const sortedActual = [...actualFiles].sort();
  const sortedExpected = [...expectedFiles].filter((relative) => relative !== "SHA256SUMS").sort();
  const sortedLedger = [...entries.keys()].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    fail("archive members do not exactly match the manifest-declared allow-list");
  }
  if (JSON.stringify(sortedLedger) !== JSON.stringify(sortedExpected)) {
    fail("SHA256SUMS does not exactly cover the manifest-declared archive members");
  }
  for (const relative of sortedExpected) {
    const memberPath = path.join(directory, relative);
    if (!existsSync(memberPath)) fail(`SHA256SUMS member is missing: ${relative}`);
    const actual = sha256(memberPath);
    if (actual !== entries.get(relative)) fail(`SHA256SUMS mismatch for ${relative}`);
  }
  return entries.size;
}

function normalizeArchiveMember(rawName) {
  const withoutPrefix = rawName.replace(/^\.\//u, "");
  if (
    withoutPrefix.length === 0 ||
    withoutPrefix.includes("\\") ||
    withoutPrefix.startsWith("/") ||
    path.posix.normalize(withoutPrefix) !== withoutPrefix ||
    withoutPrefix.split("/").includes("..")
  ) {
    fail(`unsafe archive member path: ${rawName}`);
  }
  return withoutPrefix;
}

function archiveRegularFiles(archive) {
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
  const details = execFileSync("tar", ["-tvzf", archive], { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (names.length !== details.length) fail("archive listing and metadata listing disagree");
  const seen = new Set();
  const files = [];
  for (let index = 0; index < names.length; index += 1) {
    if (names[index] === "./") continue;
    const member = normalizeArchiveMember(names[index]);
    if (member === "." || member.endsWith("/")) continue;
    if (seen.has(member)) fail(`duplicate archive member: ${member}`);
    seen.add(member);
    const detail = details[index];
    const type = detail[0];
    if (type !== "-") fail(`archive member is not a regular file: ${member}`);
    const detailName = normalizeArchiveMember(detail.trim().split(/\s+/u).at(-1) ?? "");
    if (detailName !== member) fail(`archive member metadata disagrees for ${member}`);
    files.push(member);
  }
  return files.sort();
}

function expectedArchiveMembers(candidateManifest) {
  const members = new Set();
  addCandidateMember(members, "manifest.json");
  addCandidateMember(members, candidateManifest.checksums?.manifest);
  addCandidateMember(members, candidateManifest.checksums?.all);
  addCandidateMember(members, `package/${candidateManifest.foundation?.npmTarball?.filename}`);
  addCandidateMember(members, `package/${candidateManifest.checksums?.package}`);
  addCandidateMember(members, `package/${candidateManifest.checksums?.packageIntegrity}`);
  addCandidateMember(members, `bridge/${candidateManifest.bridge?.filename}`);
  addCandidateMember(members, `bridge/${candidateManifest.checksums?.bridge}`);
  const inventory = candidateManifest.dependencyInventory;
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    fail("manifest dependencyInventory is missing");
  }
  const inventoryKeys = Object.keys(inventory).sort();
  if (JSON.stringify(inventoryKeys) !== JSON.stringify(["cargo", "licenseNotices", "npmProduction"])) {
    fail("manifest dependencyInventory keys are not canonical");
  }
  for (const member of Object.values(inventory)) addCandidateMember(members, member);
  if (!Array.isArray(candidateManifest.provenance?.members)) fail("manifest provenance members are missing");
  for (const member of candidateManifest.provenance.members) {
    addCandidateMember(members, member?.relativePath);
  }
  return members;
}

function addCandidateMember(members, relative) {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.includes("\\") ||
    relative.startsWith("/") ||
    relative === "." ||
    path.posix.normalize(relative) !== relative ||
    relative.split("/").includes("..")
  ) {
    fail(`manifest declares an invalid archive member path: ${String(relative)}`);
  }
  if (members.has(relative)) fail(`manifest declares duplicate archive member: ${relative}`);
  members.add(relative);
}

function listRegularFiles(directory, prefix = "") {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name).split(path.sep).join("/");
      const absolute = path.join(directory, relative);
      if (entry.isDirectory()) return listRegularFiles(directory, relative);
      if (entry.isSymbolicLink() || !lstatSync(absolute).isFile()) {
        fail(`extracted archive member is not a regular file: ${relative}`);
      }
      return [relative];
    })
    .sort();
}

function verifyPackageInventory(tarball, inventory) {
  if (!Array.isArray(inventory)) fail("manifest packageContentInventory is missing");
  const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((entry) => !entry.endsWith("/"))
    .sort();
  const actual = listing.map((entry) => {
    if (!entry.startsWith("package/") || path.posix.normalize(entry) !== entry) {
      fail(`unsafe npm package member path: ${entry}`);
    }
    const bytes = execFileSync("tar", ["-xOzf", tarball, entry]);
    return { path: entry.replace(/^package\//u, ""), size: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
  if (JSON.stringify(actual) !== JSON.stringify(inventory)) {
    fail("package-content inventory disagrees with the npm tarball");
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyProvenanceBundle(directory, provenance) {
  if (!provenance || !Array.isArray(provenance.members)) fail("manifest provenance members are missing");
  const actualMembers = listRegularFiles(directory)
    .filter((relative) => relative.startsWith("provenance/") || relative.startsWith("licenses/"));
  const expectedMembers = provenance.members.map((member) => member.relativePath).sort();
  if (JSON.stringify(actualMembers) !== JSON.stringify(expectedMembers)) {
    fail("manifest provenance members do not exactly cover provenance/ and licenses/");
  }
  for (const member of provenance.members) {
    if (sha256(path.join(directory, member.relativePath)) !== member.sha256) {
      fail(`provenance member digest mismatch for ${member.relativePath}`);
    }
  }
  const digestInput = provenance.members
    .slice()
    .sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0)
    .map((member) => `${member.relativePath}\0${member.sha256}\n`)
    .join("");
  if (sha256Bytes(Buffer.from(digestInput)) !== provenance.digest) {
    fail("aggregate provenance digest mismatch");
  }
}

if (manifest.source?.repository !== "IvoryHeart/herdr-world-foundation") {
  fail("manifest source repository is not IvoryHeart/herdr-world-foundation");
}
if (typeof foundationSourceCommit !== "string" || !/^[0-9a-f]{40}$/u.test(foundationSourceCommit)) {
  fail("manifest source commit is not a full immutable commit SHA");
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
verifyPackageInventory(packagePath, manifest.packageContentInventory);

const expectedArchive = expectedArchiveMembers(manifest);
const archiveMemberFiles = archiveRegularFiles(archivePath);
if (!archiveMemberFiles.includes("SHA256SUMS")) fail("release archive is missing SHA256SUMS");
const archivedFiles = archiveMemberFiles.filter((relative) => relative !== "SHA256SUMS");
const expectedArchiveFiles = [...expectedArchive].filter((relative) => relative !== "SHA256SUMS").sort();
if (JSON.stringify(archivedFiles) !== JSON.stringify(expectedArchiveFiles)) {
  fail("release archive members do not exactly match the manifest-declared allow-list");
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
  const extractedFiles = listRegularFiles(extracted).filter((relative) => relative !== "SHA256SUMS");
  if (JSON.stringify(extractedFiles) !== JSON.stringify(archivedFiles)) {
    fail("extracted archive members differ from the validated archive listing");
  }
  const ledgerEntries = verifyLedger(extracted, archivedFiles, expectedArchiveFiles);
  verifyPackageInventory(path.join(extracted, "package", manifest.foundation.npmTarball.filename), manifest.packageContentInventory);
  verifyProvenanceBundle(extracted, manifest.provenance);
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
    releaseTag: foundationReleaseTag,
    releaseUrl: foundationReleaseUrl,
    releaseArchiveSha256: sha256(archivePath),
    ledgerEntries,
  }, null, 2));
} finally {
  rmSync(extracted, { recursive: true, force: true });
}
