import { expect, test } from "@playwright/test";

test("Foundation conformance runs the generic shell and Spaces without World", async ({ page }) => {
  await page.goto("/foundation-conformance.html");
  await expect(page.locator('[data-foundation-surface="spaces"]')).toBeVisible();
  await expect(
    page.getByRole("main", { name: "Foundation conformance" })
      .getByText("Foundation conformance shell"),
  ).toBeVisible();
  await expect(page.getByText(/Office|Pixel Office/iu)).toHaveCount(0);
});
