import { expect, test } from "@playwright/test";

test.describe("@phase-0 smoke", () => {
  test("home page renders", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  });
});
