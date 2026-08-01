import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: ".scratch/playwright",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    colorScheme: "dark",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-fixture.mjs",
    url: "http://127.0.0.1:4173/api/capabilities",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
