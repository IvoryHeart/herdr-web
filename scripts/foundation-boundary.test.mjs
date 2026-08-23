import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../web/src/main.tsx", import.meta.url), "utf8");
const assembly = readFileSync(new URL("../web/src/world/worldAssembly.tsx", import.meta.url), "utf8");
const surface = readFileSync(new URL("../web/src/world/worldFoundationSurface.tsx", import.meta.url), "utf8");

test("the production entrypoint mounts the installed Foundation package", () => {
  assert.match(main, /from ["']@herdr-world\/foundation["']/u);
  assert.match(main, /mountFoundationBrowser/u);
  assert.match(main, /@herdr-world\/foundation\/styles\.css/u);
  assert.doesNotMatch(main, /createRoot|AppShell|\.\/App/u);
});

test("World assembly uses only documented Foundation exports", () => {
  assert.match(assembly, /@herdr-world\/foundation\/surfaces/u);
  assert.match(assembly, /foundationConformanceAssembly/u);
  assert.match(assembly, /createProductAssembly/u);
  assert.match(assembly, /defineSurface/u);
  assert.doesNotMatch(`${assembly}\n${surface}`, /\.\.(?:\/bridge|\/runtimeClient|\/surfaceRegistry)|TerminalView|createCommands/u);
});

test("the old generic tree is not a selected entrypoint fallback", () => {
  assert.doesNotMatch(main, /AppShell|surfaceRegistry|federatedRuntime|hostRegistry/u);
  assert.match(surface, /SurfaceHostV1/u);
});
