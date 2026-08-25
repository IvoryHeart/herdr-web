#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const temporaryRoot = mkdtempSync(join(tmpdir(), "herdr-world-packed-"));

function run(command, args) {
  execFileSync(command, args, {
    cwd: temporaryRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function copyUntrackedFiles() {
  const output = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  for (const relativePath of output.split("\0").filter(Boolean)) {
    const source = join(root, relativePath);
    const destination = join(temporaryRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

try {
  const archive = execFileSync("git", ["archive", "HEAD"], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync("tar", ["-x", "-C", temporaryRoot], {
    cwd: root,
    input: archive,
  });
  const diff = execFileSync("git", ["diff", "--binary", "HEAD"], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (diff.length) {
    execFileSync("git", ["apply", "--binary", "-"], {
      cwd: temporaryRoot,
      input: diff,
      stdio: ["pipe", "inherit", "inherit"],
    });
  }
  copyUntrackedFiles();
  if (!existsSync(join(temporaryRoot, "package.json"))) {
    throw new Error("clean checkout did not contain package.json");
  }
  run("npm", ["run", "prepare:foundation"]);
  run("npm", ["ci"]);
  run("npm", ["ci", "--prefix", "web"]);
  run("npm", ["run", "build:web"]);
  run("npm", ["run", "test:cutover-audit"]);
  console.log(`clean packed-consumer build passed in ${temporaryRoot}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
