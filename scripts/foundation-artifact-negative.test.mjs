import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const source = path.join(root, "vendor", "foundation");
const verifier = path.join(root, "scripts", "verify-foundation-artifact.mjs");

function runVerifier(directory) {
  return () => execFileSync(process.execPath, [verifier], {
    cwd: root,
    env: { ...process.env, HERDR_WORLD_FOUNDATION_ARTIFACT_DIR: directory },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function copyArtifact() {
  const directory = mkdtempSync(path.join(tmpdir(), "herdr-world-foundation-tamper-"));
  cpSync(source, directory, { recursive: true });
  return directory;
}

test("artifact verification rejects changed package bytes", () => {
  const directory = copyArtifact();
  try {
    const packagePath = path.join(directory, "herdr-world-foundation-0.1.0.tgz");
    writeFileSync(packagePath, Buffer.concat([readFileSync(packagePath), Buffer.from("tampered")]))
    assert.throws(runVerifier(directory), /SHA-256/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact verification rejects changed manifest compatibility", () => {
  const directory = copyArtifact();
  try {
    const manifestPath = path.join(directory, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.compatibility.surfaceApiVersion = 2;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(runVerifier(directory), /manifest\.json has SHA-256|Surface API/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [field, value, message] of [
  ["bridgeApiVersion", 2, /bridge API/u],
  ["webCompatVersion", 2, /webCompat/u],
  ["terminalProtocol", 19, /terminal protocol/u],
]) {
  test(`artifact verification rejects incompatible ${field}`, () => {
    const directory = copyArtifact();
    try {
      const manifestPath = path.join(directory, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.compatibility[field] = value;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      assert.throws(runVerifier(directory), message);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("artifact verification rejects an archive extra member even with a regenerated sidecar checksum", () => {
  const directory = copyArtifact();
  const staging = mkdtempSync(path.join(directory, "archive-extra-"));
  try {
    const archivePath = path.join(directory, "herdr-world-foundation-candidate-182c483bb9cf97f20201ffe916240aa5b48f4127.tar.gz");
    const extracted = path.join(staging, "candidate");
    mkdirSync(extracted);
    execFileSync("tar", ["-xzf", archivePath, "-C", extracted]);
    writeFileSync(path.join(extracted, "undeclared-session-content.txt"), "must fail closed\n");
    const tamperedArchive = path.join(staging, "tampered.tar.gz");
    execFileSync("tar", ["-czf", tamperedArchive, "-C", extracted, "."]);
    copyFileSync(tamperedArchive, archivePath);
    writeFileSync(`${archivePath}.sha256`, `${sha256(archivePath)}  ${path.basename(archivePath)}\n`);
    assert.throws(runVerifier(directory), /archive members|allow-list|SHA256SUMS/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact verification rejects traversal archive members before extraction", () => {
  const directory = copyArtifact();
  const staging = mkdtempSync(path.join(directory, "archive-traversal-"));
  try {
    const archivePath = path.join(directory, "herdr-world-foundation-candidate-182c483bb9cf97f20201ffe916240aa5b48f4127.tar.gz");
    const extracted = path.join(staging, "candidate");
    mkdirSync(extracted);
    writeFileSync(path.join(extracted, "manifest.json"), "not extracted\n");
    const tamperedArchive = path.join(staging, "tampered.tar.gz");
    execFileSync("tar", [
      "-czf",
      tamperedArchive,
      "-C",
      extracted,
      "--transform=s#manifest.json#../escape#",
      "manifest.json",
    ]);
    copyFileSync(tamperedArchive, archivePath);
    writeFileSync(`${archivePath}.sha256`, `${sha256(archivePath)}  ${path.basename(archivePath)}\n`);
    assert.throws(runVerifier(directory), /unsafe archive member path/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
