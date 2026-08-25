#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const webSourceRoot = join(root, "web", "src");
const distRoot = join(root, "web", "dist");
const packageRoot = join(root, "web", "node_modules", "@herdr-world", "foundation");
const expectedFoundation = {
  release: "v0.1.0-rc.11",
  publicationStatus: "published-github-prerelease",
  releaseUrl: "https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.11",
  archiveUrl:
    "https://github.com/IvoryHeart/herdr-world-foundation/releases/download/v0.1.0-rc.11/herdr-world-foundation-candidate-44507575918e4f745ec35970142fafed2b89113e.tar.gz",
  sourceCommit: "44507575918e4f745ec35970142fafed2b89113e",
  tagObject: "addc1e3639830c2ebf9b24385ac9725e4bd51f26",
  archiveSha256: "54c360191a442f6e19234ee246b13dfbb02c71fe9d91755fae34e86ffbfdbdd0",
  archiveChecksumSha256: "6ec906a1644421dba8c8728e1da0e27bd36d47697e3d77e11ea06607033fcda0",
  manifestSha256: "015d5180deac6600a701fc6e9c75c5fc66cf12d4d117e65d15fde1fd9328b2ae",
  manifestChecksumSha256: "c0f4921e744378afd2ae54cc15a8e49bc6615efb2760da62aa578bb3dc05ed10",
  sumsSha256: "cb8ce27512ce0571c4434605903b6ad14a75c312923c6526397e6d5e1c219e15",
  packageSha256: "2297869b5bbac30d8b53608b2142d59afb89d318ca4dee30228c42abf8e282c5",
  packageIntegrity: "sha512-apuF/Bw6Z6BTglya7MOGnRevmkDUVYsETGf6mQBhNTh5MoS5ezPgIYbO+uSGjxzv5xzzvksULRMTNSZbcZ74qw==",
  packageIntegrityFileSha256: "23c5d4562774dbcda3b6799a7a822ac864b820f1051b00121216a0c525f5cf2b",
  packageChecksumSha256: "ff016301399bc612f7bf8c9b4ddea1971f13dfa639bdce4ef7bbcabaed0b2eb8",
  bridgeSha256: "65cb7d232d1fa3079e81d7b75caf4dba4b75b2b236a935aaeb380b5aee42622c",
  bridgeChecksumSha256: "d44668c4c73fba1f835b7df6296347e24df1709e6770d2107a3dbc20583bdb83",
};
const allowedFoundationImports = new Set([
  "@herdr-world/foundation",
  "@herdr-world/foundation/surfaces",
  "@herdr-world/foundation/terminal",
  "@herdr-world/foundation/styles.css",
]);

function fail(message) {
  throw new Error(`World cutover audit failed: ${message}`);
}

function read(filename) {
  if (!existsSync(filename)) fail(`missing ${filename}`);
  return readFileSync(filename, "utf8");
}

function assertIncludes(filename, text, expected) {
  if (!text.includes(expected)) fail(`${filename} does not contain ${expected}`);
}

function importSpecifiers(source) {
  const specifiers = [];
  const fromPattern = /\bimport\s+(?!type\b)[\s\S]{0,500}?\sfrom\s*["']([^"']+)["']/gu;
  const sideEffectPattern = /\bimport\s*["']([^"']+)["']/gu;
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of source.matchAll(fromPattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(sideEffectPattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(dynamicPattern)) specifiers.push(match[1]);
  return specifiers;
}

function resolveSourceModule(filename, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(filename, "..", specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  fail(`cannot resolve production import ${specifier} from ${filename}`);
}

function auditProductionGraph() {
  const entry = join(webSourceRoot, "main.tsx");
  const queue = [entry];
  const visited = new Set();
  const externalImports = new Map();
  while (queue.length) {
    const filename = queue.pop();
    if (visited.has(filename)) continue;
    visited.add(filename);
    const source = read(filename);
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith("@herdr-world/foundation")) {
        if (!allowedFoundationImports.has(specifier)) {
          fail(`private or undocumented Foundation import ${specifier} in ${filename}`);
        }
        externalImports.set(specifier, filename);
        continue;
      }
      const dependency = resolveSourceModule(filename, specifier);
      if (dependency) queue.push(dependency);
    }
  }
  const forbiddenProductionNames = [
    "App.tsx",
    "AppShell.tsx",
    "federatedRuntime",
    "hostRegistry",
    "TerminalView",
    "WorldConversationBubble.tsx",
    "WorldSettingsDialog.tsx",
  ];
  for (const filename of visited) {
    for (const forbidden of forbiddenProductionNames) {
      if (forbidden.includes(".") ? basename(filename) === forbidden : filename.includes(forbidden)) {
        fail(`legacy production dependency ${filename}`);
      }
    }
  }
  if (visited.has(join(webSourceRoot, "styles.css"))) {
    fail("legacy combined stylesheet remains in the production graph");
  }
  if (!externalImports.has("@herdr-world/foundation")) {
    fail("production graph does not import Foundation's documented root entry");
  }
  if (!externalImports.has("@herdr-world/foundation/surfaces")) {
    fail("production graph does not import Foundation's documented surfaces entry");
  }
  if (!externalImports.has("@herdr-world/foundation/terminal")) {
    fail("production graph does not import Foundation's documented terminal entry");
  }
  if (!externalImports.has("@herdr-world/foundation/styles.css")) {
    fail("production graph does not import Foundation's documented stylesheet entry");
  }
  return visited;
}

function auditAllSourceFoundationImports() {
  const sourceFiles = listFiles(webSourceRoot).filter((filename) => /\.(?:[cm]?[jt]sx?|css)$/u.test(filename));
  const foundationSpecifier = /["'](@herdr-world\/foundation(?:\/[^"']*)?)["']/gu;
  for (const filename of sourceFiles) {
    const source = read(filename);
    for (const match of source.matchAll(foundationSpecifier)) {
      if (!allowedFoundationImports.has(match[1])) {
        fail(`private or undocumented Foundation reference ${match[1]} in ${filename}`);
      }
    }
  }
}

function auditSourceAliases() {
  const configFiles = [
    ...readdirSync(root).filter((name) => /^tsconfig(?:\..+)?\.json$/u.test(name) || /^vite\.config\./u.test(name)).map((name) => join(root, name)),
    ...readdirSync(join(root, "web"))
      .filter((name) => /^tsconfig(?:\..+)?\.json$/u.test(name) || /^vite\.config\./u.test(name))
      .map((name) => join(root, "web", name)),
  ];
  for (const filename of configFiles) {
    const config = read(filename);
    if (config.includes("@herdr-world/foundation") || config.includes("herdr-world-foundation")) {
      fail(`Foundation source alias or checkout reference is present in ${filename}`);
    }
  }
}

function auditPackageBoundary() {
  if (lstatSync(packageRoot).isSymbolicLink()) {
    fail("installed Foundation package is a symlink instead of packed package contents");
  }
  const nodeModulesRoot = realpathSync(join(root, "web", "node_modules"));
  const packageRealPath = realpathSync(packageRoot);
  if (!packageRealPath.startsWith(`${nodeModulesRoot}${sep}`)) {
    fail(`installed Foundation package resolves outside node_modules: ${packageRealPath}`);
  }
  const packageJson = JSON.parse(read(join(packageRoot, "package.json")));
  if (packageJson.name !== "@herdr-world/foundation" || packageJson.version !== "0.1.0") {
    fail("installed Foundation package identity is not the pinned candidate");
  }
  const exports = Object.keys(packageJson.exports ?? {});
  for (const expected of [".", "./surfaces", "./terminal", "./styles.css", "./assets/*", "./compatibility.json", "./package.json"]) {
    if (!exports.includes(expected)) fail(`documented Foundation export is missing: ${expected}`);
  }
  for (const filename of ["dist/index.d.ts", "dist/surfaces.d.ts", "dist/terminal.d.ts"]) {
    const declaration = read(join(packageRoot, filename));
    if (filename.endsWith("index.d.ts")) assertIncludes(filename, declaration, "FoundationBrowserRoot");
    if (filename.endsWith("surfaces.d.ts")) assertIncludes(filename, declaration, "SurfaceHostV1");
    if (filename.endsWith("terminal.d.ts")) {
      assertIncludes(filename, declaration, "ManagedTerminal");
      assertIncludes(filename, declaration, "transparentBackground?: boolean");
    }
  }
  const packageFiles = listFiles(packageRoot);
  for (const filename of packageFiles) {
    const member = relative(packageRoot, filename).split(sep).join("/");
    if (member.startsWith("src/") || (/\.tsx?$/u.test(member) && !/\.d\.ts$/u.test(member))) {
      fail(`packed Foundation contains source-only member ${member}`);
    }
  }
  if (/\b(?:src|source)\//u.test(JSON.stringify(packageJson.exports ?? {}))) {
    fail("documented Foundation exports resolve to source-only paths");
  }
  const lockfile = read(join(root, "web", "package-lock.json"));
  assertIncludes("web/package-lock.json", lockfile, '"node_modules/@herdr-world/foundation"');
  assertIncludes(
    "web/package-lock.json",
    lockfile,
    "../.foundation-cache/44507575918e4f745ec35970142fafed2b89113e/foundation.tgz",
  );
  assertIncludes("web/package-lock.json", lockfile, expectedFoundation.packageIntegrity);
  const compatibility = JSON.parse(read(join(packageRoot, "compatibility.json")));
  if (
    compatibility.foundationPackage?.name !== "@herdr-world/foundation" ||
    compatibility.foundationPackage?.version !== "0.1.0" ||
    compatibility.surfaceApiVersion !== 1 ||
    compatibility.bridge?.apiVersion !== 1 ||
    compatibility.bridge?.webCompat !== 1 ||
    compatibility.supportedHerdr?.testedVersion !== "0.8.2" ||
    compatibility.terminalProtocol !== 20
  ) {
    fail("installed Foundation compatibility record is not the pinned candidate contract");
  }
}

function auditProvenance() {
  const manifest = JSON.parse(read(join(root, "provenance", "assembly-manifest.json")));
  const dependency = manifest.foundation_dependency;
  if (
    dependency?.release !== expectedFoundation.release ||
    dependency?.publication_status !== expectedFoundation.publicationStatus ||
    dependency?.release_url !== expectedFoundation.releaseUrl ||
    dependency?.candidate_archive_url !== expectedFoundation.archiveUrl ||
    dependency?.source?.commit !== expectedFoundation.sourceCommit ||
    dependency?.tag?.object !== expectedFoundation.tagObject ||
    dependency?.tag?.peeled_commit !== expectedFoundation.sourceCommit ||
    dependency?.tag?.annotated !== true ||
    dependency?.archive_sha256 !== expectedFoundation.archiveSha256 ||
    dependency?.archive_checksum_sha256 !== expectedFoundation.archiveChecksumSha256 ||
    dependency?.manifest_sha256 !== expectedFoundation.manifestSha256 ||
    dependency?.manifest_checksum_sha256 !== expectedFoundation.manifestChecksumSha256 ||
    dependency?.sha256sums_sha256 !== expectedFoundation.sumsSha256 ||
    dependency?.package?.sha256 !== expectedFoundation.packageSha256 ||
    dependency?.package?.sri !== expectedFoundation.packageIntegrity ||
    dependency?.package?.integrity_file_sha256 !== expectedFoundation.packageIntegrityFileSha256 ||
    dependency?.package?.checksum_file_sha256 !== expectedFoundation.packageChecksumSha256 ||
    dependency?.bridge?.sha256 !== expectedFoundation.bridgeSha256 ||
    dependency?.bridge?.checksum_file_sha256 !== expectedFoundation.bridgeChecksumSha256
  ) {
    fail("assembly manifest does not record the pinned candidate provenance");
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

function auditEmittedBundle() {
  const files = listFiles(distRoot).filter((filename) => filename.endsWith(".js") || filename.endsWith(".css"));
  if (!files.length) fail("production dist is empty; build it before auditing");
  const forbidden = [
    "@herdr-world/foundation/src/",
    "@herdr-world/foundation/private",
    "herdr-world-foundation/src/",
    ".foundation-cache/",
    "../herdr-world-foundation",
    "TerminalView",
    "HostRegistry",
    "federatedRuntime",
  ];
  for (const filename of files) {
    const source = read(filename);
    for (const value of forbidden) {
      if (source.includes(value)) fail(`emitted bundle contains private/legacy path ${value}: ${filename}`);
    }
  }
}

function auditAssembly() {
  const main = read(join(webSourceRoot, "main.tsx"));
  const assembly = read(join(webSourceRoot, "world", "worldAssembly.tsx"));
  const surface = read(join(webSourceRoot, "world", "FoundationWorldSurface.tsx"));
  const terminal = read(join(webSourceRoot, "world", "FoundationWorldConversationBubble.tsx"));
  const adapter = read(join(webSourceRoot, "world", "foundationWorldAdapter.ts"));
  assertIncludes("web/src/main.tsx", main, "WorldFoundationRoot");
  assertIncludes("web/src/world/worldAssembly.tsx", assembly, "foundationConformanceAssembly.surfaces");
  assertIncludes("web/src/world/worldAssembly.tsx", assembly, 'route: "/world"');
  assertIncludes("web/src/world/FoundationWorldSurface.tsx", surface, "host.commands.dispatch");
  assertIncludes("web/src/world/FoundationWorldSurface.tsx", surface, "host.launchers");
  assertIncludes("web/src/world/FoundationWorldConversationBubble.tsx", terminal, "<ManagedTerminal");
  assertIncludes("web/src/world/foundationWorldAdapter.ts", adapter, "host.extensions.request");
  if (surface.includes("terminals.acquire")) fail("World surface created a second terminal owner");
}

try {
  auditAllSourceFoundationImports();
  auditSourceAliases();
  auditProductionGraph();
  auditPackageBoundary();
  auditProvenance();
  auditAssembly();
  auditEmittedBundle();
  console.log(
    "World cutover audit passed: packed Foundation candidate graph, terminal ownership, and emitted bundle are clean",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
