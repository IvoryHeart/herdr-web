import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
    'if (FOUNDATION_SURFACE_API_VERSION !== 1 || FOUNDATION_TERMINAL_PROTOCOL !== 20) process.exit(1);',
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
  const forbidden = /PixelOffice|WorldSurface|Office settings|officeObservability|prometheus|herdr-world-mark|world\/characters/iu;
  for (const path of emittedFiles) {
    const bytes = await readFile(path);
    if (forbidden.test(bytes.toString("utf8"))) {
      throw new Error(`Foundation artifact contains World/Office material: ${path}`);
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
  const privateImport = /@herdr-world\/foundation\/(?!surfaces(?:["']|$)|["'])/u;
  for (const path of sourceFiles) {
    const source = await readFile(path, "utf8");
    if (privateImport.test(source)) throw new Error(`private Foundation import in ${path}`);
  }
  process.stdout.write(`Foundation packed-boundary audit passed: ${artifact.filename}\n${artifact.sha512}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
