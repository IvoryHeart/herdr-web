#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const REQUIRED_POLICY_FILES = [
  "LICENSE",
  "LICENSE-APACHE-2.0",
  "NOTICE",
  "LICENSES/MIT-Herdr-Web.txt",
  "LICENSES/Apache-2.0-Herdr.txt",
  "LICENSES/Apache-2.0-Claw-Empire.txt",
  "LICENSES/OFL-1.1.txt",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "DCO.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "SUPPORT.md",
  "UPSTREAM.md",
  "docs/project-identity.md",
  "docs/world-assets.md",
  "provenance/components.json",
  "provenance/assembly-manifest.json",
  "provenance/compatibility.json",
  "provenance/office-owner-attestation.md",
  "vendor/herdr-compat/VENDOR-MANIFEST.toml",
  "web/public/world/LICENSE-PixiJS.txt",
];

const REQUIRED_LICENSES = new Set([
  "Apache-2.0",
  "MIT",
  "OFL-1.1",
]);

const SECRET_PATTERN =
  /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY|\bAKIA[0-9A-Z]{16}(?![A-Za-z0-9])|(?:https?|ssh):\/\/[^\s/@:]+:[^\s/@]+@|\b(?:bearer|authorization)\s+[A-Za-z0-9._~+/=-]{12,}/i;
const MACHINE_PATH_PATTERN = /(?:\/home\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\[^\s]+)/;
const SIBLING_CHECKOUT_PATTERN = /(?<!\.)\.\.\/(?:herdr-web|herdr-world-foundation|herdr-world)(?:[\/\s"']|$)|(?:^|[\s"'])\/[^\s"']*\/herdr-world-foundation(?:[\/\s"']|$)/i;
const LOCAL_STATE_PATH_PATTERN = /(?:^|[\/])(?:\.env(?:\.[^/]+)?|credentials?|browser-local-state|cookies?|uploads?|\.ssh)(?:$|[\/])/i;

function fail(message) {
  throw new Error(`release compliance failed: ${message}`);
}

function parseArgs(argv) {
  const options = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      options.root = resolve(argv[++index] ?? fail("--root requires a path"));
    } else if (arg === "--stage") {
      options.stage = resolve(argv[++index] ?? fail("--stage requires a path"));
    } else if (arg === "--check") {
      options.command = "check";
    } else if (arg === "--check-clean") {
      options.checkClean = true;
    } else if (arg === "--prepare-desktop") {
      options.command = "prepare-desktop";
    } else if (arg === "--prepare-source") {
      options.command = "prepare-source";
    } else if (arg === "--audit-artifact") {
      options.command = "audit-artifact";
      options.artifact = resolve(argv[++index] ?? fail("--audit-artifact requires a path"));
    } else if (arg === "--help" || arg === "-h") {
      options.command = "help";
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    fail(`git ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}`);
  }
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(`${command} ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}`);
  }
}

function pathFor(root, relativePath) {
  if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    fail(`unsafe relative path: ${relativePath}`);
  }
  return join(root, ...relativePath.split("/"));
}

function readJson(root, relativePath) {
  const filename = pathFor(root, relativePath);
  if (!existsSync(filename)) fail(`required JSON file is missing: ${relativePath}`);
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch (error) {
    fail(`invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function assertSha(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 hex digest`);
}

function assertFile(root, relativePath) {
  const filename = pathFor(root, relativePath);
  if (!existsSync(filename) || !statSync(filename).isFile()) fail(`required file is missing: ${relativePath}`);
  return filename;
}

function listFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "web" && false) continue;
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) files.push(relative(root, filename).split(sep).join("/"));
    }
  }
  visit(root);
  return files.sort();
}

function trackedFiles(root) {
  return git(root, ["ls-files", "-z"]).split("\0").filter(Boolean).sort();
}

function checkCleanCheckout(root) {
  const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) fail(`checkout is not clean:\n${status}`);
}

function validateComponents(root) {
  for (const relativePath of REQUIRED_POLICY_FILES) assertFile(root, relativePath);
  const components = readJson(root, "provenance/components.json");
  const assembly = readJson(root, "provenance/assembly-manifest.json");
  const compatibility = readJson(root, "provenance/compatibility.json");

  if (components.schema_version !== 1) fail("unsupported provenance schema version");
  const project = components.project ?? {};
  if (project.name !== "Herdr World") fail("provenance project name is not Herdr World");
  if (project.owner !== "Yaswanth Narvaneni") fail("provenance owner is not Yaswanth Narvaneni");
  if (project.original_code_license !== "Apache-2.0") fail("original World code is not Apache-2.0");
  if (project.original_code_notice !== "Copyright (c) 2026 Yaswanth Narvaneni") {
    fail("original World copyright notice is missing or changed");
  }
  if (!project.independent_statement?.includes("not affiliated with, sponsored by, endorsed by, or maintained by")) {
    fail("independent-project/non-endorsement statement is incomplete");
  }
  if (!Array.isArray(components.components) || components.components.length < 7) {
    fail("component inventory is incomplete");
  }
  const byId = new Map([
    ...(components.upstream_relationships ?? []).map((component) => [component.id, component]),
    ...components.components.map((component) => [component.id, component]),
  ]);
  for (const id of ["herdr-web-derived-generic", "herdr-runtime", "herdr-compatibility-slice", "claw-empire-sprites", "pixijs", "geist-font", "pixel-agents-reference", "historical-office-owner-attested"]) {
    if (!byId.has(id)) fail(`component inventory is missing ${id}`);
  }
  for (const component of components.components) {
    if (!component.id || !component.class || !("local_modifications" in component || component.class === "reference-only")) {
      fail(`component ${component.id ?? "(unnamed)"} lacks class or modification record`);
    }
    if (component.class !== "reference-only") {
      if (!component.repository || !component.immutable_revision || !REQUIRED_LICENSES.has(component.license)) {
        fail(`component ${component.id} lacks immutable source/license metadata`);
      }
      if (!component.notice) fail(`component ${component.id} lacks a notice path`);
    }
  }
  const reference = byId.get("pixel-agents-reference");
  if (reference.copied_files?.length !== 0 || reference.license !== null) {
    fail("Pixel Agents must remain reference-only");
  }

  const claw = byId.get("claw-empire-sprites");
  if (claw.files?.length !== 12) fail("Claw-Empire sprite inventory must contain all 12 files");
  const destinations = new Set();
  for (const file of claw.files) {
    if (destinations.has(file.destination_path)) fail(`duplicate asset destination: ${file.destination_path}`);
    destinations.add(file.destination_path);
    assertSha(file.source_sha256, `${file.source_path} source_sha256`);
    assertSha(file.destination_sha256, `${file.destination_path} destination_sha256`);
    if (file.source_sha256 !== file.destination_sha256) fail(`Claw-Empire asset is not byte-identical: ${file.destination_path}`);
    const actual = sha256(assertFile(root, file.destination_path));
    if (actual !== file.destination_sha256) fail(`destination hash mismatch for ${file.destination_path}: expected ${file.destination_sha256}, found ${actual}`);
  }

  if (readFileSync(pathFor(root, "LICENSE"), "utf8") !== readFileSync(pathFor(root, "LICENSES/MIT-Herdr-Web.txt"), "utf8")) {
    fail("inherited Herdr Web MIT notice was changed or not preserved verbatim");
  }
  if (!readFileSync(pathFor(root, "LICENSE-APACHE-2.0"), "utf8").includes("Apache License")) {
    fail("Apache-2.0 root license material is invalid");
  }
  if (!readFileSync(pathFor(root, "NOTICE"), "utf8").includes("GreenSheep01201")) {
    fail("Claw-Empire notice is missing from NOTICE");
  }
  const attestation = readFileSync(pathFor(root, "provenance/office-owner-attestation.md"), "utf8");
  for (const evidence of ["7be916e3c4713582c72665cd787ef0300658ea26", "c69defe64687882158af30ae2f8375dde165dba4", "6ab54a94369e8695c3bac2cf94ac76bab62613563382e4a712944ff0ff70e028", "56edfdd364ace64663e4a98c931d15d2ef5bfcb725acee8d8791e88f974fd210", "f4975a6e840506a003f39153dfa6e32830d311624402980a1884ecb5351a1e3f"]) {
    if (!attestation.includes(evidence)) fail(`Office owner evidence is missing ${evidence}`);
  }
  if (assembly.schema_version !== 1 || !assembly.artifacts?.["source-archive"] || !assembly.artifacts?.["desktop-tarball"]) {
    fail("assembly manifest is incomplete");
  }
  if (compatibility.herdr?.terminal_protocol !== 20 || compatibility.herdr?.commit !== "9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c") {
    fail("protocol-20 Herdr compatibility record is missing or changed");
  }
  const ledgerStatuses = new Set(["not-proposed", "discussion", "proposed", "accepted", "declined", "superseded", "downstream-only", "adopted"]);
  for (const entry of compatibility.upstream_ledger ?? []) {
    if (!entry.concern || !ledgerStatuses.has(entry.status)) fail("upstream ledger contains an invalid entry");
  }
  const required = new Set(components.release_required_material ?? []);
  for (const file of REQUIRED_POLICY_FILES) if (!required.has(file) && file !== "CODE_OF_CONDUCT.md" && file !== "CONTRIBUTING.md" && file !== "DCO.md" && file !== "GOVERNANCE.md" && file !== "SECURITY.md" && file !== "SUPPORT.md" && file !== "UPSTREAM.md" && file !== "docs/project-identity.md" && file !== "docs/world-assets.md" && file !== "provenance/compatibility.json") {
    fail(`provenance release material omits ${file}`);
  }
  return { components, assembly, compatibility };
}

function readInstalledPackageMetadata(root, lockRelativePath, packagePath) {
  const packageFile = join(root, lockRelativePath === "web/package-lock.json" ? "web" : "", packagePath, "package.json");
  if (!existsSync(packageFile)) return null;
  try {
    return JSON.parse(readFileSync(packageFile, "utf8"));
  } catch (error) {
    fail(`invalid installed npm package metadata at ${packageFile}: ${error.message}`);
  }
}

function npmSbom(root, lockRelativePath) {
  const lock = readJson(root, lockRelativePath);
  const components = [];
  for (const [packagePath, locked] of Object.entries(lock.packages ?? {})) {
    if (!packagePath || !locked.version) continue;
    const metadata = readInstalledPackageMetadata(root, lockRelativePath, packagePath);
    const optional = Boolean(locked.optional);
    const license = locked.license ?? metadata?.license ?? (Array.isArray(metadata?.licenses) ? metadata.licenses.map((item) => item.type ?? item).join(" OR ") : metadata?.licenses);
    if (!license && !optional) fail(`npm package license metadata is unresolved for included package ${packagePath}; install from the lockfile or classify it before release`);
    components.push({
      package_path: packagePath,
      name: metadata?.name ?? packagePath.replace(/^node_modules\//, ""),
      version: locked.version,
      resolved: locked.resolved ?? null,
      integrity: locked.integrity ?? null,
      license: license ?? null,
      dev: Boolean(locked.dev),
      optional,
      included: !optional || Boolean(metadata),
      omitted_reason: optional && !metadata ? "optional package not installed on this platform" : null,
      dependencies: Object.fromEntries(Object.entries(locked.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    });
  }
  return {
    sbom_schema: "herdr-world/npm-lock-inventory-v1",
    lockfile: lockRelativePath,
    lockfile_version: lock.lockfileVersion,
    package_name: lock.name,
    package_version: lock.version,
    components: components.sort((a, b) => a.package_path.localeCompare(b.package_path)),
  };
}

function cargoSbom(root, manifestRelativePath) {
  const metadata = JSON.parse(run("cargo", ["metadata", "--manifest-path", manifestRelativePath, "--locked", "--format-version", "1"], root));
  const packages = metadata.packages.map((pkg) => {
    if (!pkg.license) fail(`Cargo package license metadata is unresolved for ${pkg.name} ${pkg.version}`);
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      source: pkg.source ?? "workspace",
      manifest_path: relative(root, pkg.manifest_path).split(sep).join("/"),
      dependencies: pkg.dependencies.map((dependency) => ({ name: dependency.name, kind: dependency.kind, optional: dependency.optional })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  return { sbom_schema: "herdr-world/cargo-metadata-inventory-v1", manifest: manifestRelativePath, packages };
}

function writeJson(filename, value) {
  mkdirSync(join(filename, ".."), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceManifest(root) {
  const files = trackedFiles(root).map((relativePath) => ({ path: relativePath, sha256: sha256(assertFile(root, relativePath)) }));
  return {
    manifest_schema: "herdr-world/source-files-v1",
    source_commit: git(root, ["rev-parse", "HEAD"]),
    files,
    excluded: ["node_modules/**", "web/node_modules/**", "web/dist/**", "bridge/target/**", "vendor/herdr-compat/target/**", "dist-packages/**", ".scratch/**", ".worktrees/**", "browser-local-state/**", "credentials/**", "uploads/**"],
  };
}

function copyPolicyMaterial(root, stage) {
  const copies = [
    ["LICENSE", "LICENSE"],
    ["LICENSE-APACHE-2.0", "LICENSE-APACHE-2.0"],
    ["NOTICE", "NOTICE"],
    ["LICENSES", "LICENSES"],
    ["provenance/components.json", "provenance/components.json"],
    ["provenance/assembly-manifest.json", "provenance/assembly-manifest.json"],
    ["provenance/compatibility.json", "provenance/compatibility.json"],
    ["provenance/office-owner-attestation.md", "provenance/office-owner-attestation.md"],
    ["docs/world-assets.md", "provenance/docs/world-assets.md"],
    ["UPSTREAM.md", "provenance/UPSTREAM.md"],
    ["vendor/herdr-compat/VENDOR-MANIFEST.toml", "provenance/vendor/herdr-compat/VENDOR-MANIFEST.toml"],
    ["web/public/world/LICENSE-PixiJS.txt", "provenance/third-party/LICENSE-PixiJS.txt"],
  ];
  for (const [source, destination] of copies) {
    const sourcePath = pathFor(root, source);
    const destinationPath = pathFor(stage, destination);
    mkdirSync(join(destinationPath, ".."), { recursive: true });
    cpSync(sourcePath, destinationPath, { recursive: true });
  }
}

function filesUnder(root) {
  return listFiles(root).filter((file) => !file.startsWith(".git/"));
}

function writeArtifactMaterial(stage, sourceCommit, sboms, kind) {
  writeJson(join(stage, "provenance/source-manifest.json"), sourceCommit);
  writeJson(join(stage, "provenance/sbom/npm-root.json"), sboms.npmRoot);
  writeJson(join(stage, "provenance/sbom/npm-web.json"), sboms.npmWeb);
  writeJson(join(stage, "provenance/sbom/cargo-bridge.json"), sboms.cargoBridge);
  writeJson(join(stage, "provenance/sbom/cargo-herdr-compat.json"), sboms.cargoCompat);

  const manifestPath = join(stage, "provenance/artifact-manifest.json");
  const manifestFiles = filesUnder(stage).filter((file) => file !== "provenance/artifact-manifest.json" && file !== "provenance/SHA256SUMS").map((file) => ({ path: file, sha256: sha256(join(stage, file)) }));
  writeJson(manifestPath, {
    manifest_schema: "herdr-world/artifact-members-v1",
    artifact_kind: kind,
    source_commit: sourceCommit.source_commit,
    members: manifestFiles,
    checksum_file: "provenance/SHA256SUMS",
    excluded_from_members: ["provenance/artifact-manifest.json", "provenance/SHA256SUMS"],
  });
  const checksumLines = filesUnder(stage).filter((file) => file !== "provenance/SHA256SUMS").map((file) => `${sha256(join(stage, file))}  ${file}`).sort();
  writeFileSync(join(stage, "provenance/SHA256SUMS"), `${checksumLines.join("\n")}\n`);
}

function auditTextAndNames(directory, kind) {
  const files = filesUnder(directory);
  const forbidden = [];
  for (const file of files) {
    if (LOCAL_STATE_PATH_PATTERN.test(file) || /(?:^|\/)(?:\.git|node_modules|target|dist-packages|browser-local-state|credentials|sibling-checkout)(?:\/|$)/i.test(file)) {
      forbidden.push(`${file}: forbidden local/generated state path`);
    }
    const content = readFileSync(join(directory, file));
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    if (SECRET_PATTERN.test(text)) forbidden.push(`${file}: possible credential or secret`);
    if (MACHINE_PATH_PATTERN.test(text)) forbidden.push(`${file}: machine-specific absolute path`);
    if (SIBLING_CHECKOUT_PATTERN.test(text)) forbidden.push(`${file}: sibling checkout reference`);
  }
  if (forbidden.length) fail(`artifact security audit failed:\n${forbidden.join("\n")}`);

  if (kind === "desktop") {
    const allowed = (file) => file === "README.md" || file === "LICENSE" || file === "LICENSE-APACHE-2.0" || file === "NOTICE" || file === "bin/herdr-web" || file === "bin/herdr-web-bridge" || file.startsWith("LICENSES/") || file.startsWith("provenance/") || file.startsWith("share/herdr-web/web/");
    const undeclared = files.filter((file) => !allowed(file));
    if (undeclared.length) fail(`desktop artifact contains undeclared members: ${undeclared.join(", ")}`);
  }
}

function validateArtifactManifest(stage) {
  const manifestFile = assertFile(stage, "provenance/artifact-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (manifest.manifest_schema !== "herdr-world/artifact-members-v1") fail("artifact manifest schema is invalid");
  if (!["desktop", "source"].includes(manifest.artifact_kind)) fail("artifact manifest kind is invalid");
  const actual = new Set(filesUnder(stage));
  for (const member of manifest.members ?? []) {
    assertSha(member.sha256, `artifact member ${member.path}`);
    if (!actual.has(member.path)) fail(`artifact manifest member is missing: ${member.path}`);
    const actualHash = sha256(join(stage, member.path));
    if (actualHash !== member.sha256) fail(`artifact member hash mismatch: ${member.path}`);
    actual.delete(member.path);
  }
  for (const excluded of manifest.excluded_from_members ?? []) actual.delete(excluded);
  if (actual.size) fail(`artifact has unmanifested members: ${[...actual].join(", ")}`);
  const checksumLines = readFileSync(join(stage, manifest.checksum_file), "utf8").trim().split("\n").filter(Boolean);
  for (const line of checksumLines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) fail(`invalid checksum line: ${line}`);
    const filename = match[2];
    if (filename === manifest.checksum_file) fail("checksum file must not checksum itself");
    if (!existsSync(join(stage, filename)) || sha256(join(stage, filename)) !== match[1]) fail(`checksum mismatch for ${filename}`);
  }
}

function validateRepository(root, { clean = false } = {}) {
  validateComponents(root);
  if (clean) checkCleanCheckout(root);
  return true;
}

function prepareArtifact(root, stage, kind) {
  if (!stage) fail(`--${kind === "desktop" ? "prepare-desktop" : "prepare-source"} requires --stage`);
  validateRepository(root, { clean: true });
  mkdirSync(stage, { recursive: true });
  copyPolicyMaterial(root, stage);
  if (kind === "desktop") {
    assertFile(stage, "README.md");
  }
  const sboms = {
    npmRoot: npmSbom(root, "package-lock.json"),
    npmWeb: npmSbom(root, "web/package-lock.json"),
    cargoBridge: cargoSbom(root, "bridge/Cargo.toml"),
    cargoCompat: cargoSbom(root, "vendor/herdr-compat/Cargo.toml"),
  };
  writeArtifactMaterial(stage, sourceManifest(root), sboms, kind);
  auditTextAndNames(stage, kind);
  validateArtifactManifest(stage);
}

function printHelp() {
  console.log(`Usage:\n  node scripts/release-compliance.mjs --check [--root PATH] [--check-clean]\n  node scripts/release-compliance.mjs --prepare-desktop --root PATH --stage PATH\n  node scripts/release-compliance.mjs --prepare-source --root PATH --stage PATH\n  node scripts/release-compliance.mjs --audit-artifact PATH`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    printHelp();
  } else if (options.command === "prepare-desktop") {
    prepareArtifact(options.root, options.stage, "desktop");
    console.log(`desktop release material validated: ${options.stage}`);
  } else if (options.command === "prepare-source") {
    prepareArtifact(options.root, options.stage, "source");
    console.log(`source release material validated: ${options.stage}`);
  } else if (options.command === "audit-artifact") {
    if (!options.artifact) fail("--audit-artifact requires a path");
    const manifest = readJson(options.artifact, "provenance/artifact-manifest.json");
    auditTextAndNames(options.artifact, manifest.artifact_kind);
    validateArtifactManifest(options.artifact);
    console.log(`artifact security and manifest audit passed: ${options.artifact}`);
  } else {
    validateRepository(options.root, { clean: options.checkClean });
    console.log(`release compliance passed for ${options.root}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
