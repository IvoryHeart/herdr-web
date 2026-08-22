import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const root = resolve(new URL("..", import.meta.url).pathname);
const packageDir = join(root, "packages", "foundation");
const outputDir = join(root, "dist-packages");
const manifestPath = join(packageDir, "foundation-manifest.json");

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesIn(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

await execFileAsync("npm", ["run", "build"], { cwd: packageDir });
const distFiles = (await filesIn(join(packageDir, "dist"))).sort();
const contentHash = createHash("sha512");
for (const path of distFiles) {
  contentHash.update(relative(join(packageDir, "dist"), path));
  contentHash.update("\0");
  contentHash.update(await readFile(path));
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.integrity = `sha512-${contentHash.digest("base64")}`;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(outputDir, { recursive: true });

const { stdout } = await execFileAsync(
  "npm",
  ["pack", "--json", "--pack-destination", outputDir],
  { cwd: packageDir },
);
const packed = JSON.parse(stdout)[0];
const tarball = resolve(outputDir, packed.filename);
const tarballHash = createHash("sha512").update(await readFile(tarball)).digest("base64");
const artifact = {
  package: manifest.package,
  packageVersion: manifest.packageVersion,
  filename: relative(root, tarball),
  sha512: `sha512-${tarballHash}`,
  integrity: manifest.integrity,
  surfaceApi: manifest.surfaceApi,
  bridgeApi: manifest.bridgeApi,
  web_compat: manifest.web_compat,
  supportedHerdr: manifest.supportedHerdr,
  terminalProtocol: manifest.terminalProtocol,
};
await writeFile(join(outputDir, "foundation-artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
