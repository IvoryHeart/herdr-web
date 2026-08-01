import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { hostStore } from "./hostStore";

const evidenceDir = resolve("docs/evidence/spec-010");

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1200 },
]) {
  test(`captures federated desktop at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((store) => {
      localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
    }, hostStore());
    await page.goto("/");
    await page
      .getByRole("group", { name: "Host" })
      .getByRole("button", { name: "All", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Codex B / })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Offline E, offline" }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(
        evidenceDir,
        `responsive-${viewport.width}x${viewport.height}.png`,
      ),
      fullPage: true,
    });
  });
}

test("captures the 375x812 switcher and usable terminal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, hostStore());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Offline E, offline" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidenceDir, "responsive-375x812-switcher.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Remote B, compatible" }).click();
  await page.getByRole("button", { name: /^Codex B / }).click();
  await expect(
    page.getByRole("button", { name: "Back to switcher" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refit terminal" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".stage")
        .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41),
    )
    .toBe(0);
  await page.screenshot({
    path: resolve(evidenceDir, "responsive-375x812-terminal.png"),
    fullPage: true,
  });
});
