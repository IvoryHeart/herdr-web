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
    launchOptions:
      process.env.HERDR_WEB_HARDWARE_GPU === "1"
        ? {
            args: [
              "--use-angle=vulkan",
              "--enable-features=Vulkan",
              "--disable-vulkan-surface",
              "--disable-background-timer-throttling",
              "--disable-renderer-backgrounding",
              "--disable-backgrounding-occluded-windows",
            ],
          }
        : undefined,
  },
  webServer: {
    command: "node scripts/e2e-fixture.mjs",
    url: "http://127.0.0.1:4173/api/capabilities",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
