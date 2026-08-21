import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const checker = join(root, "scripts/release-compliance.mjs");

function temporaryDirectory(name) {
  const directory = join(tmpdir(), `herdr-world-${name}-${process.pid}-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  return directory;
}

function copyRepository(name) {
  const directory = temporaryDirectory(name);
  cpSync(root, directory, {
    recursive: true,
    filter(source) {
      const normalized = source.replaceAll("\\", "/");
      return !normalized.endsWith("/.git") && !normalized.includes("/.git/") && !normalized.includes("/node_modules/") && !normalized.includes("/web/node_modules/") && !normalized.includes("/bridge/target/") && !normalized.includes("/vendor/herdr-compat/target/");
    },
  });
  return directory;
}

function run(args, cwd = root) {
  return execFileSync(process.execPath, [checker, ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function fails(args, cwd) {
  assert.throws(() => run(args, cwd), /release compliance failed|artifact/);
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function filesUnder(directory) {
  return execFileSync("find", [directory, "-type", "f", "-not", "-path", `${directory}/provenance/artifact-manifest.json`, "-not", "-path", `${directory}/provenance/SHA256SUMS`], { encoding: "utf8" }).trim().split("\n").filter(Boolean).map((file) => relative(directory, file).replaceAll("\\", "/")).sort();
}

function makeDesktopFixture(name) {
  const directory = temporaryDirectory(name);
  for (const file of ["LICENSE", "LICENSE-APACHE-2.0", "NOTICE"]) {
    mkdirSync(join(directory, "LICENSES"), { recursive: true });
    cpSync(join(root, file), join(directory, file));
  }
  cpSync(join(root, "LICENSES"), join(directory, "LICENSES"), { recursive: true });
  cpSync(join(root, "provenance"), join(directory, "provenance"), { recursive: true });
  writeFileSync(join(directory, "README.md"), "Herdr World test release\n");
  mkdirSync(join(directory, "bin"), { recursive: true });
  writeFileSync(join(directory, "bin/herdr-web"), "#!/bin/sh\n");
  writeFileSync(join(directory, "bin/herdr-web-bridge"), "binary fixture\n");
  mkdirSync(join(directory, "share/herdr-web/web"), { recursive: true });
  writeFileSync(join(directory, "share/herdr-web/web/index.html"), "<title>Herdr World</title>\n");
  const members = filesUnder(directory).map((path) => ({ path, sha256: sha256(join(directory, path)) }));
  writeFileSync(join(directory, "provenance/artifact-manifest.json"), `${JSON.stringify({ manifest_schema: "herdr-world/artifact-members-v1", artifact_kind: "desktop", source_commit: "test", members, checksum_file: "provenance/SHA256SUMS", excluded_from_members: ["provenance/artifact-manifest.json", "provenance/SHA256SUMS"] }, null, 2)}\n`);
  const checksumLines = [...filesUnder(directory), "provenance/artifact-manifest.json"].map((path) => `${sha256(join(directory, path))}  ${path}`).sort();
  writeFileSync(join(directory, "provenance/SHA256SUMS"), `${checksumLines.join("\n")}\n`);
  return directory;
}

test("clean provenance policy passes and the clean-checkout gate is real", () => {
  assert.match(run(["--check"]), /release compliance passed/);
  const fixture = copyRepository("clean");
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fixture });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: fixture });
    execFileSync("git", ["config", "user.name", "Release Compliance Test"], { cwd: fixture });
    execFileSync("git", ["add", "."], { cwd: fixture });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: fixture });
    assert.match(run(["--check", "--check-clean"], fixture), /release compliance passed/);
    writeFileSync(join(fixture, "unrelated-workspace-file.txt"), "must not ship\n");
    fails(["--check", "--check-clean"], fixture);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("missing notice, incorrect hash, and incomplete provenance fail closed", () => {
  const missingNotice = copyRepository("missing-notice");
  try {
    rmSync(join(missingNotice, "LICENSES/Apache-2.0-Claw-Empire.txt"));
    fails(["--check"], missingNotice);
  } finally {
    rmSync(missingNotice, { recursive: true, force: true });
  }

  const incorrectHash = copyRepository("incorrect-hash");
  try {
    const filename = join(incorrectHash, "provenance/components.json");
    const components = JSON.parse(readFileSync(filename, "utf8"));
    components.components.find((component) => component.id === "claw-empire-sprites").files[0].destination_sha256 = "0".repeat(64);
    writeFileSync(filename, `${JSON.stringify(components, null, 2)}\n`);
    fails(["--check"], incorrectHash);
  } finally {
    rmSync(incorrectHash, { recursive: true, force: true });
  }

  const incomplete = copyRepository("incomplete-provenance");
  try {
    const filename = join(incomplete, "provenance/components.json");
    const components = JSON.parse(readFileSync(filename, "utf8"));
    components.components.find((component) => component.id === "claw-empire-sprites").files.pop();
    writeFileSync(filename, `${JSON.stringify(components, null, 2)}\n`);
    fails(["--check"], incomplete);
  } finally {
    rmSync(incomplete, { recursive: true, force: true });
  }
});

test("desktop assembly audit excludes secrets, local state, workstation paths, and unrelated files", () => {
  const artifact = makeDesktopFixture("artifact");
  try {
    assert.match(run(["--audit-artifact", artifact]), /artifact security and manifest audit passed/);
    writeFileSync(join(artifact, "unrelated-workspace-file.txt"), "not declared\n");
    fails(["--audit-artifact", artifact]);

    const secretArtifact = makeDesktopFixture("secret-artifact");
    try {
      writeFileSync(join(secretArtifact, "credentials.json"), "{\"token\":\"not-for-release\"}\n");
      fails(["--audit-artifact", secretArtifact]);
    } finally {
      rmSync(secretArtifact, { recursive: true, force: true });
    }

    const pathArtifact = makeDesktopFixture("path-artifact");
    try {
      writeFileSync(join(pathArtifact, "README.md"), `built at ${["/home", "alice", "private-checkout"].join("/")}\n`);
      fails(["--audit-artifact", pathArtifact]);
    } finally {
      rmSync(pathArtifact, { recursive: true, force: true });
    }

    const siblingArtifact = makeDesktopFixture("sibling-artifact");
    try {
      writeFileSync(join(siblingArtifact, "README.md"), "resolved from ../herdr-world-foundation\n");
      fails(["--audit-artifact", siblingArtifact]);
    } finally {
      rmSync(siblingArtifact, { recursive: true, force: true });
    }
  } finally {
    rmSync(artifact, { recursive: true, force: true });
  }
});

test("source assembly audit uses the source manifest boundary", () => {
  const artifact = makeDesktopFixture("source-artifact");
  try {
    mkdirSync(join(artifact, "src"), { recursive: true });
    writeFileSync(join(artifact, "src/example.ts"), "export const source = true;\n");
    const manifestPath = join(artifact, "provenance/artifact-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifact_kind = "source";
    manifest.members.push({ path: "src/example.ts", sha256: sha256(join(artifact, "src/example.ts")) });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const checksumLines = [...filesUnder(artifact), "provenance/artifact-manifest.json"].map((path) => `${sha256(join(artifact, path))}  ${path}`).sort();
    writeFileSync(join(artifact, "provenance/SHA256SUMS"), `${checksumLines.join("\n")}\n`);
    assert.match(run(["--audit-artifact", artifact]), /artifact security and manifest audit passed/);
  } finally {
    rmSync(artifact, { recursive: true, force: true });
  }
});
