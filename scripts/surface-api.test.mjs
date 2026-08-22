import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPESCRIPT = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");

async function findFile(directory, filename) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const result = await findFile(candidate, filename);
      if (result) return result;
    } else if (entry.name === filename) {
      return candidate;
    }
  }
  return null;
}

function compile(config) {
  try {
    execFileSync(process.execPath, [TYPESCRIPT, "-p", config], {
      cwd: ROOT,
      stdio: "pipe",
    });
  } catch (error) {
    const output = Buffer.concat([error.stdout ?? Buffer.alloc(0), error.stderr ?? Buffer.alloc(0)]);
    throw new Error(output.toString("utf8") || error.message, { cause: error });
  }
}

test("emitted surfaces declarations are self-contained and consumable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "herdr-web-surface-api-"));
  try {
    const declarationDirectory = path.join(directory, "declarations");
    const declarationConfig = path.join(directory, "declarations.tsconfig.json");
    await writeFile(
      declarationConfig,
      JSON.stringify({
        compilerOptions: {
          declaration: true,
          emitDeclarationOnly: true,
          noEmitOnError: true,
          outDir: declarationDirectory,
          rootDir: ROOT,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          jsx: "react-jsx",
        },
        files: [path.join(ROOT, "web", "src", "surfaces.ts")],
      }),
    );
    compile(declarationConfig);

    const emittedSurfaces = await findFile(declarationDirectory, "surfaces.d.ts");
    assert.ok(emittedSurfaces, "TypeScript did not emit the public surfaces declaration");
    const declaration = await readFile(emittedSurfaces, "utf8");
    for (const privateDependency of [
      "terminalSessionOwner",
      "terminalRenderer",
      '"./bridge"',
      "surfaceLifecycle",
      "surfaceContract",
    ]) {
      assert.doesNotMatch(
        declaration,
        new RegExp(privateDependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `public declarations must not expose ${privateDependency}`,
      );
    }

    const consumer = path.join(directory, "consumer.ts");
    const surfacesImport = emittedSurfaces.replace(/\.d\.ts$/u, "");
    await writeFile(
      consumer,
      `import { FOUNDATION_SURFACE_API_VERSION, defineSurface, validateProductAssembly } from ${JSON.stringify(surfacesImport)};
import type { SurfaceRegistration, SurfaceTerminalAcquireOptions } from ${JSON.stringify(surfacesImport)};

type Context = { id: string };
const registration: SurfaceRegistration<Context> = {
  definition: {
    id: "consumer",
    label: "Consumer",
    route: "/consumer",
    semanticIcon: "consumer",
    requiredBridgeFeatures: [],
  },
  load: async () => ({ default: ({ context }: { context: Context }) => { void context; return null; } }),
  createContext: (host) => ({ id: host.navigation.currentSurfaceId }),
  dispose: (context) => { void context; },
};
const token = defineSurface(registration);
validateProductAssembly({
  surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
  surfaces: [token],
});
const terminalOptions: SurfaceTerminalAcquireOptions = {
  outputCoalesceMs: 16,
  initialSize: { cols: 80, rows: 24 },
  inputEnabled: true,
  resizeEnabled: true,
  scrollEnabled: true,
  focusOwner: false,
  onOutput: (data) => { void data; },
  onState: (state) => { void state; },
  onConnectAttempt: () => {},
};
void terminalOptions;
// @ts-expect-error Host construction is intentionally not part of the public facade.
import { createSurfaceHostV1 } from ${JSON.stringify(surfacesImport)};
void createSurfaceHostV1;
`,
    );
    const consumerConfig = path.join(directory, "consumer.tsconfig.json");
    await writeFile(
      consumerConfig,
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          jsx: "react-jsx",
        },
        files: [consumer],
      }),
    );
    compile(consumerConfig);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
