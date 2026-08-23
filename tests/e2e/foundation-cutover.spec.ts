import { expect, test } from "@playwright/test";
import { hostStore } from "./hostStore";

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/reset");
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, hostStore());
});

test("boots the released Foundation host and admits the World Office surface", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("complementary", { name: "Switcher" })).toContainText("Foundation");
  await expect(
    page.getByRole("button", { name: "Foundation surface: Spaces", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Foundation surface: Office", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Same origin", exact: true })).toBeVisible();
  await expect(page.locator(".terminal-stage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refit terminal" })).toBeEnabled();

  await page.getByRole("button", { name: "Foundation surface: Office", exact: true }).click();
  await expect(page).toHaveURL(/\/world$/);
  await expect(page.getByRole("region", { name: "Scrollable Pixel Office scene", exact: true })).toBeVisible();
  await expect(page.locator(".world-canvas-host[data-renderer='pixi']")).toBeVisible();

  await page.getByRole("button", { name: "Foundation surface: Spaces", exact: true }).click();
  await expect(page.locator(".terminal-stage")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("keeps the Office composition usable at a compact viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/world");

  await expect(page.getByRole("region", { name: "Scrollable Pixel Office scene", exact: true })).toBeVisible();
  await expect(page.locator(".world-stage-scroll")).toBeVisible();
  await expect(page.getByRole("button", { name: "Foundation surface: Office", exact: true })).toBeVisible();
  await expect(page.locator(".world-stage-scroll")).toHaveCSS("overflow-x", "auto");
});

test("refreshes the selected surface and keeps the joined multi-bridge view admitted", async ({
  page,
}) => {
  await page.goto("/");
  const hostGroup = page.getByRole("group", { name: "Host", exact: true });
  await expect(hostGroup.getByRole("button", { name: "Same origin", exact: true })).toBeVisible();
  await expect(hostGroup.getByRole("button", { name: "Remote B", exact: true })).toBeVisible();
  await expect(hostGroup.getByRole("button", { name: "Protocol C", exact: true })).toBeVisible();

  await hostGroup.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: /Codex B/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Codex C/ })).toBeVisible();
  await page.getByRole("button", { name: "Foundation surface: Office", exact: true }).click();
  await expect(page.locator(".world-canvas-host[data-renderer='pixi']")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("region", { name: "Scrollable Pixel Office scene", exact: true })).toBeVisible();
  await expect(page.locator(".world-canvas-host[data-renderer='pixi']")).toBeVisible();
  await page.getByRole("button", { name: "Foundation surface: Spaces", exact: true }).click();
  const terminalInput = page.locator("textarea.ghostty-hidden-input").first();
  await expect(terminalInput).toBeVisible();
  await page.locator(".terminal-stage").click();
  await expect(terminalInput).toBeFocused();
});
