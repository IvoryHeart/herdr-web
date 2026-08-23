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
  assert.match(main, /\.\/world\/world\.css/u);
  assert.doesNotMatch(main, /\.\/styles\.css/u);
  assert.doesNotMatch(main, /createRoot|AppShell|\.\/App/u);
});

test("World assembly uses only documented Foundation exports", () => {
  assert.match(assembly, /@herdr-world\/foundation\/surfaces/u);
  assert.match(assembly, /foundationConformanceAssembly/u);
  assert.match(assembly, /createProductAssembly/u);
  assert.match(assembly, /defineSurface/u);
  assert.match(assembly, /defineProductSettingsContribution/u);
  assert.match(assembly, /productSettings:\s*worldSettings/u);
  assert.doesNotMatch(`${assembly}\n${surface}`, /\.\.(?:\/bridge|\/runtimeClient|\/surfaceRegistry)|TerminalView|createCommands/u);
});

test("the old generic tree is not a selected entrypoint fallback", () => {
  assert.doesNotMatch(main, /AppShell|surfaceRegistry|federatedRuntime|hostRegistry/u);
  assert.match(surface, /SurfaceHostV1/u);
});

test("the selected World stylesheet contains only World-owned selectors", () => {
  const worldStyles = readFileSync(new URL("../web/src/world/world.css", import.meta.url), "utf8");
  assert.match(worldStyles, /\.world-stage-shell/u);
  assert.doesNotMatch(worldStyles, /^(?:\.app|\.sidebar|\.terminal-stage|\.stage(?:[-\s{]))/mu);
});
