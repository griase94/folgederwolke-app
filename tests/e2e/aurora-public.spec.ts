import { test, expect } from "@playwright/test";

// @phase-aurora-slice3 — Aurora slice 3: public chrome + Auslage success page.
// Spec: docs/superpowers/specs/2026-06-11-aurora-ui-redesign-design.md §6.

test.describe("@phase-aurora-slice3 Aurora public — header context actions", () => {
  test("sign-in header offers Auslage einreichen", async ({ page }) => {
    await page.goto("/sign-in");
    const action = page.locator('header a[href="/auslage-einreichen"]');
    await expect(action).toBeVisible();
    await expect(action).toContainText("Auslage einreichen");
  });

  test("auslage form header offers Vereins-Login", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    const action = page.locator('header a[href="/sign-in"]');
    await expect(action).toBeVisible();
    await expect(action).toContainText("Vereins-Login");
  });

  test("auslage success page header offers Vereins-Login", async ({ page }) => {
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");
    await expect(page.locator('header a[href="/sign-in"]')).toBeVisible();
  });
});
