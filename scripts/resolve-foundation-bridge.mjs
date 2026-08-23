#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, "vendor", "foundation");
const manifest = JSON.parse(readFileSync(path.join(artifactRoot, "manifest.json"), "utf8"));
const archivePath = path.join(
  artifactRoot,
  `herdr-world-foundation-candidate-${manifest.source.commit}.tar.gz`,
);

function fail(message) {
  throw new Error(`Foundation bridge resolution failed: ${message}`);
}

if (process.platform !== "linux" || process.arch !== "x64") {
  fail(`the checked-in candidate bridge is linux-x86_64, not ${process.platform}-${process.arch}`);
}

const filename = manifest.bridge?.filename;
const expectedHash = manifest.bridge?.sha256;
if (filename !== "herdr-world-bridge-0.1.0-linux-x86_64" || !/^[0-9a-f]{64}$/u.test(expectedHash ?? "")) {
  fail("candidate bridge metadata is not the reviewed linux-x86_64 artifact");
}

const cacheRoot = path.join(root, ".scratch", "foundation-bridge", manifest.source.commit);
const outputPath = path.join(cacheRoot, filename);
mkdirSync(cacheRoot, { recursive: true });

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractBridge() {
  if (existsSync(outputPath)) {
    const cached = readFileSync(outputPath);
    if (digest(cached) === expectedHash) {
      chmodSync(outputPath, 0o755);
      return;
    }
  }
  const bytes = execFileSync("tar", ["-xOzf", archivePath, `./bridge/${filename}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
  if (digest(bytes) !== expectedHash) fail("candidate bridge bytes do not match the manifest SHA-256");
  writeFileSync(outputPath, bytes, { mode: 0o755 });
  chmodSync(outputPath, 0o755);
}

execFileSync(process.execPath, [path.join(root, "scripts", "verify-foundation-artifact.mjs")], {
  cwd: root,
  stdio: "ignore",
});
extractBridge();

if (process.argv.includes("--path")) {
  process.stdout.write(`${outputPath}${os.EOL}`);
} else {
  process.stdout.write(JSON.stringify({
    path: outputPath,
    version: manifest.bridge.version,
    sha256: expectedHash,
    sourceCommit: manifest.source.commit,
  }, null, 2) + os.EOL);
}
