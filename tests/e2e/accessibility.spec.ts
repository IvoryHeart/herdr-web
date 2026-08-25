import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hostStore } from "./hostStore";

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/reset");
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, hostStore());
});

test("core controls are keyboard-visible, labelled, reduced-motion safe, and axe clean", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "localhost, compatible" }),
  ).toBeVisible();
  await expect(page.locator(".brand-title")).toContainText("Herdr World");
  await expect(page.locator(".brand-logo")).toHaveAttribute("src", "/herdr-world-mark.svg");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  const settings = page.getByRole("button", { name: "Settings" });
  await settings.focus();
  await expect(settings).toBeFocused();
  expect(
    await settings.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe("none");

  await settings.press("Enter");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(settings).toBeFocused();

  const rowAnimation = await page
    .locator(".space-row")
    .first()
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(rowAnimation)).toBeLessThanOrEqual(0.00001);
  await expect(
    page.getByRole("button", { name: "Refit terminal" }),
  ).toBeEnabled();
});

test("the production CSP admits canonical terminal font resources", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-security-policy"]).toContain("font-src 'self' data:;");

  const consoleCspErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("Content Security Policy directive")
    ) {
      consoleCspErrors.push(message.text().slice(0, 240));
    }
  });
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __herdrCspViolations?: Array<{ blockedURI: string; directive: string }>;
    };
    state.__herdrCspViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      state.__herdrCspViolations?.push({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective,
      });
    });
  });

  await page.goto("/");
  await expect(page.locator(".terminal-stage")).toBeVisible();
  await expect(page.locator(".terminal-overlay")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);

  const policyViolations = await page.evaluate(() => {
    const state = window as typeof window & {
      __herdrCspViolations?: Array<{ blockedURI: string; directive: string }>;
    };
    return state.__herdrCspViolations ?? [];
  });
  expect(policyViolations).toEqual([]);
  expect(consoleCspErrors).toEqual([]);
});

test("Office settings stay inside the Foundation-owned settings dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible();
  const bridgeList = settingsDialog.getByRole("list", { name: "Saved bridges" });
  await expect(bridgeList).toBeVisible();
  expect(await bridgeList.evaluate((list) =>
    Array.from(list.children).every((item) => item.getAttribute("role") === "listitem"),
  )).toBe(true);
  const bridgeAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    bridgeAccessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await settingsDialog.getByRole("tab", { name: "Office settings" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator(".world-settings-form")).toBeVisible();
  await expect(page.locator(".world-settings-form")).toContainText(
    "Not configured; Economy will show no data",
  );
  await expect(page.locator(".world-settings-form input[placeholder^='http']")).toHaveValue("");
  await expect(page.locator(".world-settings-form .overlay-scrim")).toHaveCount(0);
  const officeAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    officeAccessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await settingsDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
