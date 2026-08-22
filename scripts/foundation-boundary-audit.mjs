import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
await execFileAsync("node", ["scripts/package-foundation.mjs"], { cwd: root });
const artifact = JSON.parse(
  await readFile(join(root, "dist-packages", "foundation-artifact.json"), "utf8"),
);
const tarball = join(root, artifact.filename);
const temp = await mkdtemp(join(tmpdir(), "herdr-world-foundation-boundary-"));

try {
  await writeFile(join(temp, "package.json"), JSON.stringify({
    name: "clean-foundation-consumer",
    private: true,
    type: "module",
  }, null, 2));
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], {
    cwd: temp,
  });
  await writeFile(join(temp, "consumer.mjs"), [
    'import { FOUNDATION_SURFACE_API_VERSION, FOUNDATION_TERMINAL_PROTOCOL } from "@herdr-world/foundation/surfaces";',
    'import { FoundationConformanceApp } from "@herdr-world/foundation/conformance";',
    'if (FOUNDATION_SURFACE_API_VERSION !== 1 || FOUNDATION_TERMINAL_PROTOCOL !== 20) process.exit(1);',
    'if (typeof FoundationConformanceApp !== "function") process.exit(1);',
  ].join("\n"));
  await execFileAsync("node", ["consumer.mjs"], { cwd: temp });

  const listing = (await execFileAsync("tar", ["-tzf", tarball])).stdout;
  if (!listing.includes("package/dist/surfaces.js") || !listing.includes("package/foundation-manifest.json")) {
    throw new Error("packed Foundation artifact is missing public output or manifest");
  }
  const extracted = join(temp, "artifact");
  await execFileAsync("mkdir", ["-p", extracted]);
  await execFileAsync("tar", ["-xzf", tarball, "-C", extracted]);
  const packageRoot = join(extracted, "package");
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const foundationManifest = JSON.parse(
    await readFile(join(packageRoot, "foundation-manifest.json"), "utf8"),
  );
  for (const [field, expected] of Object.entries({
    package: "@herdr-world/foundation",
    packageVersion: packageJson.version,
    surfaceApi: artifact.surfaceApi,
    bridgeApi: artifact.bridgeApi,
    web_compat: artifact.web_compat,
    supportedHerdr: artifact.supportedHerdr,
    terminalProtocol: artifact.terminalProtocol,
  })) {
    if (foundationManifest[field] !== expected) {
      throw new Error(`packed Foundation manifest mismatch: ${field}`);
    }
  }
  if (
    !packageJson.exports?.["./surfaces"] ||
    !packageJson.exports?.["./conformance"] ||
    packageJson.dependencies ||
    packageJson.optionalDependencies
  ) {
    throw new Error("packed Foundation exports or dependency metadata is not boundary-safe");
  }
  for (const peer of ["react", "react-dom"]) {
    if (!packageJson.peerDependencies?.[peer]) {
      throw new Error(`${peer} must remain a Foundation peer dependency`);
    }
  }
  const emittedFiles = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.(?:js|css|map|svg|png|woff2?)$/u.test(entry.name)) emittedFiles.push(path);
    }
  }
  await visit(packageRoot);
  const forbidden = /PixelOffice|WorldSurface|Office settings|officeObservability|prometheus|herdr-world-mark|world[\\/]characters|web[\\/]src[\\/]world|@herdr[\\/]web|provider implementation/iu;
  for (const path of emittedFiles) {
    const bytes = await readFile(path);
    if (forbidden.test(bytes.toString("utf8"))) {
      throw new Error(`Foundation artifact contains World/Office material: ${path}`);
    }
  }

  // Exercise the actual World consumer from an isolated checkout copy. The
  // temporary package contains the exact tarball, never ../packages/foundation
  // or an unpacked sibling source tree, and its lockfile records the tarball
  // integrity before npm ci runs.
  const worldCheckout = join(temp, "world-checkout");
  const worldConsumer = join(worldCheckout, "web");
  await cp(join(root, "web"), worldConsumer, {
    recursive: true,
    filter: (source) => !/(?:\/|\\)(?:node_modules|dist)(?:\/|\\|$)/u.test(source),
  });
  await cp(join(root, "contracts"), join(worldCheckout, "contracts"), { recursive: true });
  await cp(tarball, join(worldConsumer, "foundation-artifact.tgz"));
  const worldPackagePath = join(worldConsumer, "package.json");
  const worldPackage = JSON.parse(await readFile(worldPackagePath, "utf8"));
  worldPackage.dependencies["@herdr-world/foundation"] = "file:./foundation-artifact.tgz";
  await writeFile(worldPackagePath, `${JSON.stringify(worldPackage, null, 2)}\n`);
  await execFileAsync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: worldConsumer,
  });
  const worldLock = JSON.parse(await readFile(join(worldConsumer, "package-lock.json"), "utf8"));
  const installedFoundation = worldLock.packages?.["node_modules/@herdr-world/foundation"];
  if (
    installedFoundation?.resolved !== "file:foundation-artifact.tgz" ||
    installedFoundation.integrity !== artifact.sha512
  ) {
    throw new Error("World lockfile does not pin the exact Foundation tarball and integrity");
  }
  if (JSON.stringify(worldPackage).includes("../packages/foundation")) {
    throw new Error("World consumer retained a Foundation sibling/source dependency");
  }
  await execFileAsync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: worldConsumer,
  });
  await execFileAsync("npm", ["run", "build"], { cwd: worldConsumer });
  await execFileAsync("npm", ["test", "--", "--run"], { cwd: worldConsumer });
  const worldDist = join(worldConsumer, "dist");
  await visit(worldDist);
  const privateDistImport = /@herdr-world\/foundation\/(?!surfaces(?:["']|$)|conformance(?:["']|$))[^"']+/u;
  for (const path of emittedFiles) {
    const content = await readFile(path, "utf8");
    if (privateDistImport.test(content)) {
      throw new Error(`World emitted graph contains a private Foundation import: ${path}`);
    }
  }

  const sourceFiles = [];
  async function visitWorld(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visitWorld(path);
      else if (/\.(?:ts|tsx)$/u.test(entry.name)) sourceFiles.push(path);
    }
  }
  await visitWorld(join(root, "web", "src"));
  const privateImport = /@herdr-world\/foundation\/(?!surfaces(?:["']|$)|conformance(?:["']|$))[^"']+/u;
  for (const path of sourceFiles) {
    const source = await readFile(path, "utf8");
    if (privateImport.test(source)) throw new Error(`private Foundation import in ${path}`);
  }
  process.stdout.write(`Foundation packed-boundary audit passed: ${artifact.filename}\n${artifact.sha512}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
