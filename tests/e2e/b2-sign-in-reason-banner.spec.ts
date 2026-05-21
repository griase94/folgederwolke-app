import { test, expect } from "@playwright/test";

// @phase-9 B-2 — sign-in ?reason= banner (whitelist of 3 reasons; XSS-safe).
//
// Reasons handled: signed-out, public-form-coming-soon, not-authorised.
// Any other value (or none) → no banner.

test.describe("@phase-9 B-2 sign-in reason banner", () => {
  test("?reason=signed-out renders abgemeldet banner", async ({ page }) => {
    await page.goto("/sign-in?reason=signed-out");
    const banner = page.getByTestId("sign-in-reason-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Du wurdest abgemeldet");
    await expect(banner).toHaveAttribute("data-reason", "signed-out");
  });

  test("?reason=not-authorised renders kein Zugriff banner", async ({
    page,
  }) => {
    await page.goto("/sign-in?reason=not-authorised");
    const banner = page.getByTestId("sign-in-reason-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("keinen Zugriff");
  });

  test("?reason=public-form-coming-soon renders coming-soon banner", async ({
    page,
  }) => {
    await page.goto("/sign-in?reason=public-form-coming-soon");
    await expect(page.getByTestId("sign-in-reason-banner")).toContainText(
      /öffentliche Formular/i,
    );
  });

  test("unknown reason value renders no banner (XSS-safe whitelist)", async ({
    page,
  }) => {
    await page.goto("/sign-in?reason=<script>alert(1)</script>");
    await expect(page.getByTestId("sign-in-reason-banner")).toHaveCount(0);
  });

  test("no reason param renders no banner", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByTestId("sign-in-reason-banner")).toHaveCount(0);
  });
});
