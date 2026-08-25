#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const FOUNDATION = Object.freeze({
  repository: "IvoryHeart/herdr-world-foundation",
  release: "v0.1.0-rc.11",
  releaseUrl: "https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.11",
  candidateArchiveUrl:
    "https://github.com/IvoryHeart/herdr-world-foundation/releases/download/v0.1.0-rc.11/herdr-world-foundation-candidate-44507575918e4f745ec35970142fafed2b89113e.tar.gz",
  sourceCommit: "44507575918e4f745ec35970142fafed2b89113e",
  tagObject: "addc1e3639830c2ebf9b24385ac9725e4bd51f26",
  archiveName:
    "herdr-world-foundation-candidate-44507575918e4f745ec35970142fafed2b89113e.tar.gz",
  archiveSha256: "54c360191a442f6e19234ee246b13dfbb02c71fe9d91755fae34e86ffbfdbdd0",
  archiveChecksumSha256: "6ec906a1644421dba8c8728e1da0e27bd36d47697e3d77e11ea06607033fcda0",
  manifestSha256: "015d5180deac6600a701fc6e9c75c5fc66cf12d4d117e65d15fde1fd9328b2ae",
  manifestChecksumSha256: "c0f4921e744378afd2ae54cc15a8e49bc6615efb2760da62aa578bb3dc05ed10",
  sumsSha256: "cb8ce27512ce0571c4434605903b6ad14a75c312923c6526397e6d5e1c219e15",
  packageSha256: "2297869b5bbac30d8b53608b2142d59afb89d318ca4dee30228c42abf8e282c5",
  packageIntegrity:
    "sha512-apuF/Bw6Z6BTglya7MOGnRevmkDUVYsETGf6mQBhNTh5MoS5ezPgIYbO+uSGjxzv5xzzvksULRMTNSZbcZ74qw==",
  packageIntegrityFileSha256: "23c5d4562774dbcda3b6799a7a822ac864b820f1051b00121216a0c525f5cf2b",
  packageChecksumSha256: "ff016301399bc612f7bf8c9b4ddea1971f13dfa639bdce4ef7bbcabaed0b2eb8",
  bridgeSha256: "65cb7d232d1fa3079e81d7b75caf4dba4b75b2b236a935aaeb380b5aee42622c",
  bridgeChecksumSha256: "d44668c4c73fba1f835b7df6296347e24df1709e6770d2107a3dbc20583bdb83",
  packageName: "@herdr-world/foundation",
  packageVersion: "0.1.0",
  surfaceApiVersion: 1,
  bridgeApiVersion: 1,
  webCompatibilityVersion: 1,
  herdrVersion: "0.8.2",
  herdrAuditedCommit: "9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c",
  terminalProtocol: 20,
});

const root = resolve(new URL("..", import.meta.url).pathname);
const cacheRoot = resolve(
  process.env.HERDR_WORLD_FOUNDATION_CACHE ?? join(root, ".foundation-cache", FOUNDATION.sourceCommit),
);
const extractedRoot = join(cacheRoot, "candidate");
const npmPackageFile = join(cacheRoot, "foundation.tgz");
const githubToken = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

function fail(message) {
  throw new Error(`Foundation candidate verification failed: ${message}`);
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function sha512Integrity(filename) {
  return `sha512-${createHash("sha512").update(readFileSync(filename)).digest("base64")}`;
}

function assertHash(filename, expected, label) {
  const actual = sha256(filename);
  if (actual !== expected) {
    fail(`${label} hash mismatch: expected ${expected}, found ${actual}`);
  }
}

function assertSafeRelativePath(value, label) {
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) {
    fail(`${label} contains an unsafe path: ${value}`);
  }
}

function readChecksumFile(filename) {
  return readFileSync(filename, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})\s+(.+)$/u);
      if (!match) fail(`malformed checksum line in ${filename}: ${line}`);
      assertSafeRelativePath(match[2], "checksum member");
      return { digest: match[1], path: match[2] };
    });
}

function verifyChecksumMembers(directory, checksumFile) {
  const entries = readChecksumFile(join(directory, checksumFile));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) fail(`duplicate checksum member: ${entry.path}`);
    seen.add(entry.path);
    const filename = join(directory, ...entry.path.split("/"));
    if (!existsSync(filename) || !statSync(filename).isFile()) {
      fail(`checksum member is missing: ${entry.path}`);
    }
    assertHash(filename, entry.digest, entry.path);
  }
}

function verifyDetachedChecksum(targetFile, checksumFile) {
  const entries = readChecksumFile(checksumFile);
  if (entries.length !== 1 || entries[0].path !== targetFile.split(sep).pop()) {
    fail(`detached checksum does not name ${targetFile}`);
  }
  assertHash(targetFile, entries[0].digest, `detached checksum for ${targetFile}`);
}

async function downloadVerifiedAsset(url, filename, expectedHash) {
  if (existsSync(filename)) {
    if (!statSync(filename).isFile()) fail(`release asset cache entry is not a file: ${filename}`);
    assertHash(filename, expectedHash, `cached release asset ${filename}`);
    return;
  }

  const headers = {
    Accept: "application/octet-stream",
    "User-Agent": "herdr-world-foundation-preparer",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const response = await fetch(url, {
    headers,
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    fail(`could not download ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  const maximumAssetBytes = 128 * 1024 * 1024;
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumAssetBytes) {
    fail(`release asset exceeds the ${maximumAssetBytes}-byte download limit: ${url}`);
  }

  const chunks = [];
  let receivedBytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumAssetBytes) {
      await reader.cancel();
      fail(`release asset exceeds the ${maximumAssetBytes}-byte download limit: ${url}`);
    }
    chunks.push(Buffer.from(value));
  }

  const temporaryFile = `${filename}.download-${process.pid}`;
  try {
    writeFileSync(temporaryFile, Buffer.concat(chunks, receivedBytes), { flag: "wx" });
    assertHash(temporaryFile, expectedHash, `downloaded release asset ${url}`);
    renameSync(temporaryFile, filename);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
}

async function resolveReleaseAssetApiUrls(expectedNames) {
  const apiUrl =
    `https://api.github.com/repos/${FOUNDATION.repository}/releases/tags/${encodeURIComponent(FOUNDATION.release)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "herdr-world-foundation-preparer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    const authenticationHint = githubToken ? "" : "; set GH_TOKEN if the repository is private";
    fail(
      `could not resolve ${FOUNDATION.release} release assets: HTTP ${response.status} ${response.statusText}${authenticationHint}`,
    );
  }
  const release = await response.json();
  if (
    release.tag_name !== FOUNDATION.release ||
    release.html_url !== FOUNDATION.releaseUrl ||
    release.draft !== false ||
    release.prerelease !== true
  ) {
    fail(`GitHub release metadata is incompatible with the pinned ${FOUNDATION.release} prerelease`);
  }

  const tagReferenceResponse = await fetch(
    `https://api.github.com/repos/${FOUNDATION.repository}/git/ref/tags/${encodeURIComponent(FOUNDATION.release)}`,
    { headers },
  );
  if (!tagReferenceResponse.ok) {
    fail(`could not resolve the pinned ${FOUNDATION.release} tag object`);
  }
  const tagReference = await tagReferenceResponse.json();
  if (tagReference.object?.type !== "tag" || tagReference.object.sha !== FOUNDATION.tagObject) {
    fail(`GitHub tag ${FOUNDATION.release} is not the pinned annotated tag object`);
  }
  const tagObjectResponse = await fetch(
    `https://api.github.com/repos/${FOUNDATION.repository}/git/tags/${FOUNDATION.tagObject}`,
    { headers },
  );
  if (!tagObjectResponse.ok) {
    fail(`could not peel the pinned ${FOUNDATION.release} tag object`);
  }
  const tagObject = await tagObjectResponse.json();
  if (tagObject.object?.type !== "commit" || tagObject.object.sha !== FOUNDATION.sourceCommit) {
    fail(`GitHub tag ${FOUNDATION.release} does not peel to the pinned Foundation source`);
  }

  const expectedDownloadUrl = (name) =>
    `https://github.com/${FOUNDATION.repository}/releases/download/${FOUNDATION.release}/${name}`;
  if (!Array.isArray(release.assets) || release.assets.length !== expectedNames.size) {
    fail(`GitHub release must contain exactly the ${expectedNames.size} declared assets`);
  }
  const urls = new Map();
  for (const asset of release.assets ?? []) {
    if (!expectedNames.has(asset.name)) fail(`GitHub release contains undeclared asset ${asset.name}`);
    if (urls.has(asset.name)) fail(`GitHub release contains duplicate ${asset.name} assets`);
    if (
      asset.state !== "uploaded" ||
      asset.browser_download_url !== expectedDownloadUrl(asset.name) ||
      typeof asset.url !== "string" ||
      !asset.url.startsWith(`https://api.github.com/repos/${FOUNDATION.repository}/releases/assets/`)
    ) {
      fail(`GitHub release metadata is invalid for ${asset.name}`);
    }
    urls.set(asset.name, asset.url);
  }
  for (const name of expectedNames) {
    if (!urls.has(name)) fail(`GitHub release is missing the required ${name} asset`);
  }
  return urls;
}

async function materializeFoundationInput() {
  const expectedReleaseUrl =
    `https://github.com/${FOUNDATION.repository}/releases/tag/${FOUNDATION.release}`;
  const expectedArchiveUrl =
    `https://github.com/${FOUNDATION.repository}/releases/download/${FOUNDATION.release}/${FOUNDATION.archiveName}`;
  if (FOUNDATION.releaseUrl !== expectedReleaseUrl) {
    fail(`release URL is not the canonical pinned URL for ${FOUNDATION.release}`);
  }
  if (FOUNDATION.candidateArchiveUrl !== expectedArchiveUrl) {
    fail(`candidate archive URL is not the canonical pinned URL for ${FOUNDATION.release}`);
  }

  const releaseDirectory = join(cacheRoot, "release-assets");
  mkdirSync(releaseDirectory, { recursive: true });
  const assetUrl = (name) =>
    `https://github.com/${FOUNDATION.repository}/releases/download/${FOUNDATION.release}/${name}`;
  const publicAssets = {
    archiveFile: join(releaseDirectory, FOUNDATION.archiveName),
    archiveChecksumFile: join(releaseDirectory, `${FOUNDATION.archiveName}.sha256`),
    manifestFile: join(releaseDirectory, "manifest.json"),
    manifestChecksumFile: join(releaseDirectory, "manifest.json.sha256"),
    sumsFile: join(releaseDirectory, "SHA256SUMS"),
  };
  const downloads = [
    {
      name: FOUNDATION.archiveName,
      filename: publicAssets.archiveFile,
      sha256: FOUNDATION.archiveSha256,
    },
    {
      name: `${FOUNDATION.archiveName}.sha256`,
      filename: publicAssets.archiveChecksumFile,
      sha256: FOUNDATION.archiveChecksumSha256,
    },
    {
      name: "manifest.json",
      filename: publicAssets.manifestFile,
      sha256: FOUNDATION.manifestSha256,
    },
    {
      name: "manifest.json.sha256",
      filename: publicAssets.manifestChecksumFile,
      sha256: FOUNDATION.manifestChecksumSha256,
    },
    {
      name: "SHA256SUMS",
      filename: publicAssets.sumsFile,
      sha256: FOUNDATION.sumsSha256,
    },
  ];
  const expectedNames = new Set(downloads.map(({ name }) => name));
  const releaseAssetUrls = downloads.some(({ filename }) => !existsSync(filename))
    ? await resolveReleaseAssetApiUrls(expectedNames)
    : new Map();
  await Promise.all([
    ...downloads.map(({ name, filename, sha256: expectedHash }) =>
      downloadVerifiedAsset(releaseAssetUrls.get(name) ?? assetUrl(name), filename, expectedHash)),
  ]);
  return {
    archiveFile: publicAssets.archiveFile,
    archiveChecksumFile: publicAssets.archiveChecksumFile,
    publicAssets,
  };
}

function assertMatchingReleaseAsset(extractedFile, releaseFile, label) {
  if (!readFileSync(extractedFile).equals(readFileSync(releaseFile))) {
    fail(`${label} release asset does not byte-match the candidate archive member`);
  }
}

function tarMembers(filename) {
  return execFileSync("tar", ["-tzf", filename], { encoding: "utf8" })
    .split(/\r?\n/u)
    .map((entry) => entry.replace(/\/$/u, ""))
    .filter(Boolean);
}

function assertNoUnsafeTarMembers(members) {
  for (const member of members) {
    assertSafeRelativePath(member, "archive member");
  }
}

function assertNoSymlinks(directory) {
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      if (entry.isSymbolicLink()) fail(`candidate contains a symlink: ${relative(directory, filename)}`);
      if (entry.isDirectory()) visit(filename);
    }
  }
  visit(directory);
}

function readJson(filename, label) {
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function readTarJson(filename, member, label) {
  try {
    return JSON.parse(execFileSync("tar", ["-xOf", filename, member], { encoding: "utf8" }));
  } catch (error) {
    fail(`${label} is missing or not valid JSON: ${error.stderr?.trim() || error.message}`);
  }
}

function verifyCandidate() {
  const manifest = readJson(join(extractedRoot, "manifest.json"), "candidate manifest");
  if (manifest.source?.repository !== FOUNDATION.repository || manifest.source.commit !== FOUNDATION.sourceCommit) {
    fail("candidate source provenance does not match the pinned Foundation source");
  }
  const npmTarball = manifest.foundation?.npmTarball;
  if (
    manifest.foundation?.packageName !== FOUNDATION.packageName ||
    manifest.foundation?.version !== FOUNDATION.packageVersion ||
    manifest.foundation?.surfaceApiVersion !== FOUNDATION.surfaceApiVersion ||
    npmTarball?.sha256 !== FOUNDATION.packageSha256 ||
    npmTarball?.integrity !== FOUNDATION.packageIntegrity
  ) {
    fail("Foundation package metadata is incompatible with the pinned candidate input");
  }
  const compatibility = manifest.compatibility;
  if (
    compatibility?.bridgeApiVersion !== FOUNDATION.bridgeApiVersion ||
    compatibility.webCompatVersion !== FOUNDATION.webCompatibilityVersion ||
    compatibility.supportedHerdrVersion !== FOUNDATION.herdrVersion ||
    compatibility.supportedHerdrMinimumVersion !== FOUNDATION.herdrVersion ||
    compatibility.supportedHerdrAuditedCommit !== FOUNDATION.herdrAuditedCommit ||
    compatibility.terminalProtocol !== FOUNDATION.terminalProtocol
  ) {
    fail("Foundation compatibility metadata is incompatible with World");
  }
  const bridge = manifest.bridge;
  if (bridge?.sha256 !== FOUNDATION.bridgeSha256 || bridge?.version !== FOUNDATION.packageVersion) {
    fail("Foundation bridge metadata is incompatible with the pinned candidate input");
  }
  verifyChecksumMembers(extractedRoot, "SHA256SUMS");
  assertHash(join(extractedRoot, "manifest.json"), FOUNDATION.manifestSha256, "candidate manifest");
  const packageFile = join(extractedRoot, "package", npmTarball.filename);
  assertHash(packageFile, FOUNDATION.packageSha256, "Foundation npm package");
  if (sha512Integrity(packageFile) !== FOUNDATION.packageIntegrity) {
    fail("Foundation npm package SRI mismatch");
  }
  const packageIntegrityFile = join(extractedRoot, "package", `${npmTarball.filename}.integrity`);
  assertHash(packageIntegrityFile, FOUNDATION.packageIntegrityFileSha256, "Foundation npm integrity file");
  if (readFileSync(packageIntegrityFile, "utf8").trim() !== FOUNDATION.packageIntegrity) {
    fail("Foundation npm integrity file does not match the pinned SRI");
  }
  assertHash(
    join(extractedRoot, "package", `${npmTarball.filename}.sha256`),
    FOUNDATION.packageChecksumSha256,
    "Foundation npm detached checksum",
  );
  const packageJson = readTarJson(packageFile, "package/package.json", "Foundation package metadata");
  if (packageJson.name !== FOUNDATION.packageName || packageJson.version !== FOUNDATION.packageVersion) {
    fail("packed Foundation package identity is incompatible with the pinned candidate input");
  }
  const packageCompatibility = readTarJson(
    packageFile,
    "package/compatibility.json",
    "Foundation package compatibility",
  );
  if (
    packageCompatibility.foundationPackage?.name !== FOUNDATION.packageName ||
    packageCompatibility.foundationPackage?.version !== FOUNDATION.packageVersion ||
    packageCompatibility.surfaceApiVersion !== FOUNDATION.surfaceApiVersion ||
    packageCompatibility.bridge?.apiVersion !== FOUNDATION.bridgeApiVersion ||
    packageCompatibility.bridge?.webCompat !== FOUNDATION.webCompatibilityVersion ||
    packageCompatibility.supportedHerdr?.minimumVersion !== FOUNDATION.herdrVersion ||
    packageCompatibility.supportedHerdr?.testedVersion !== FOUNDATION.herdrVersion ||
    packageCompatibility.supportedHerdr?.commit !== FOUNDATION.herdrAuditedCommit ||
    packageCompatibility.terminalProtocol !== FOUNDATION.terminalProtocol
  ) {
    fail("packed Foundation compatibility record is incompatible with the pinned candidate input");
  }
  const bridgeFile = join(extractedRoot, "bridge", bridge.filename);
  assertHash(bridgeFile, FOUNDATION.bridgeSha256, "Foundation bridge");
  assertHash(
    join(extractedRoot, "bridge", `${bridge.filename}.sha256`),
    FOUNDATION.bridgeChecksumSha256,
    "Foundation bridge detached checksum",
  );
  if (existsSync(npmPackageFile)) {
    assertHash(npmPackageFile, FOUNDATION.packageSha256, "cached Foundation npm package");
  } else {
    writeFileSync(npmPackageFile, readFileSync(packageFile));
  }
  assertHash(npmPackageFile, FOUNDATION.packageSha256, "cached Foundation npm package");
  writeFileSync(join(cacheRoot, "verified.json"), `${JSON.stringify({
    release: FOUNDATION.release,
    releaseUrl: FOUNDATION.releaseUrl,
    candidateArchiveUrl: FOUNDATION.candidateArchiveUrl,
    sourceCommit: FOUNDATION.sourceCommit,
    tagObject: FOUNDATION.tagObject,
    archiveSha256: FOUNDATION.archiveSha256,
    manifestSha256: FOUNDATION.manifestSha256,
    packageSha256: FOUNDATION.packageSha256,
    bridgeSha256: FOUNDATION.bridgeSha256,
    packageIntegrityFileSha256: FOUNDATION.packageIntegrityFileSha256,
    packageChecksumSha256: FOUNDATION.packageChecksumSha256,
    bridgeChecksumSha256: FOUNDATION.bridgeChecksumSha256,
    packageIntegrity: FOUNDATION.packageIntegrity,
    surfaceApiVersion: FOUNDATION.surfaceApiVersion,
    bridgeApiVersion: FOUNDATION.bridgeApiVersion,
    webCompatibilityVersion: FOUNDATION.webCompatibilityVersion,
    herdrVersion: FOUNDATION.herdrVersion,
    herdrAuditedCommit: FOUNDATION.herdrAuditedCommit,
    terminalProtocol: FOUNDATION.terminalProtocol,
    packageFile: relative(root, npmPackageFile).split(sep).join("/"),
  }, null, 2)}\n`);
}

async function main() {
  mkdirSync(cacheRoot, { recursive: true });
  const { archiveFile, archiveChecksumFile, publicAssets } = await materializeFoundationInput();
  if (!existsSync(archiveFile) || !statSync(archiveFile).isFile()) {
    fail(`Foundation archive is not a file: ${archiveFile}`);
  }
  if (archiveFile.split(sep).pop() !== FOUNDATION.archiveName) {
    fail(`Foundation archive must name ${FOUNDATION.archiveName}`);
  }
  assertHash(archiveFile, FOUNDATION.archiveSha256, "candidate archive");
  if (!existsSync(archiveChecksumFile) || !statSync(archiveChecksumFile).isFile()) {
    fail(`candidate archive detached checksum is missing: ${archiveChecksumFile}`);
  }
  assertHash(archiveChecksumFile, FOUNDATION.archiveChecksumSha256, "candidate archive detached checksum");
  verifyDetachedChecksum(archiveFile, archiveChecksumFile);
  const archiveMembers = tarMembers(archiveFile);
  assertNoUnsafeTarMembers(archiveMembers);
  if (!existsSync(extractedRoot)) {
    mkdirSync(extractedRoot, { recursive: true });
    execFileSync("tar", ["-xzf", archiveFile, "-C", extractedRoot]);
  }
  assertNoSymlinks(extractedRoot);
  const manifestFile = join(extractedRoot, "manifest.json");
  const manifestChecksumFile = join(extractedRoot, "manifest.json.sha256");
  assertHash(manifestFile, FOUNDATION.manifestSha256, "candidate manifest");
  assertHash(manifestChecksumFile, FOUNDATION.manifestChecksumSha256, "candidate manifest detached checksum");
  assertHash(join(extractedRoot, "SHA256SUMS"), FOUNDATION.sumsSha256, "candidate SHA256SUMS");
  verifyDetachedChecksum(manifestFile, manifestChecksumFile);
  verifyChecksumMembers(extractedRoot, "manifest.json.sha256");
  verifyDetachedChecksum(publicAssets.manifestFile, publicAssets.manifestChecksumFile);
  assertMatchingReleaseAsset(manifestFile, publicAssets.manifestFile, "manifest");
  assertMatchingReleaseAsset(
    manifestChecksumFile,
    publicAssets.manifestChecksumFile,
    "manifest checksum",
  );
  assertMatchingReleaseAsset(
    join(extractedRoot, "SHA256SUMS"),
    publicAssets.sumsFile,
    "SHA256SUMS",
  );
  verifyCandidate();
  console.log(
    `verified ${FOUNDATION.packageName}@${FOUNDATION.packageVersion} from ${FOUNDATION.release} (${FOUNDATION.sourceCommit})`,
  );
  console.log(`package=${npmPackageFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
