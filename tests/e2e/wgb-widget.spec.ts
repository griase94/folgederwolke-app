/**
 * E2E tests for WGBWidget on the admin dashboard. @phase-6
 *
 * Tests verify:
 *  - The widget renders with correct heading text
 *  - Progress bar is visible with correct ARIA attributes
 *  - Status badge text is present
 *  - Statutory note (§19 UStG) is visible
 */

import { test, expect } from "@playwright/test";

test.describe("WGBWidget on dashboard @phase-6", () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as admin before each test (reuse auth state if configured).
    await page.goto("/sign-in");
    // In CI the magic-link flow is bypassed via a test session cookie set by
    // the test-auth fixture. If not set, skip the full E2E (unit tests cover
    // the logic; this test checks render only in authenticated context).
    const cookie = await page.context().cookies();
    const hasSession = cookie.some((c) => c.name === "session");
    if (!hasSession) {
      // Attempt magic-link sign-in with the CI test account.
      const ciEmail = process.env["E2E_ADMIN_EMAIL"] ?? "";
      if (!ciEmail) {
        test.skip();
        return;
      }
    }
    await page.goto("/app/dashboard");
  });

  test("renders WGB-Freigrenze heading", async ({ page }) => {
    const heading = page.getByText(/WGB-Freigrenze/i);
    await expect(heading).toBeVisible();
  });

  test("shows §19 UStG reference", async ({ page }) => {
    await expect(page.getByText(/§19 UStG/i)).toBeVisible();
  });

  test("progress bar has correct ARIA attributes", async ({ page }) => {
    const bar = page.getByRole("progressbar", {
      name: /WGB-Freigrenze.*ausgeschöpft/i,
    });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuemin", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
    // aria-valuenow is a non-negative integer string
    const valuenow = await bar.getAttribute("aria-valuenow");
    expect(Number(valuenow)).toBeGreaterThanOrEqual(0);
  });

  test("shows status badge", async ({ page }) => {
    // One of the four possible status labels must be visible.
    const possibleLabels = [
      "Im grünen Bereich",
      "Erhöht (>50 %)",
      "Kritisch (>80 %)",
      "Freigrenze überschritten",
    ];
    let found = false;
    for (const label of possibleLabels) {
      if (await page.getByText(label).isVisible()) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("shows Brutto-Einnahmen statutory note", async ({ page }) => {
    await expect(
      page.getByText(/Brutto-Einnahmen des wirtschaftlichen/i),
    ).toBeVisible();
  });
});
