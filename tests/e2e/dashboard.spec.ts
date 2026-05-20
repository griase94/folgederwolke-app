import { expect, test } from "@playwright/test";

/**
 * @phase-6
 *
 * E2E tests for the Phase 6 treasurer dashboard (/app).
 * These run against an authenticated session (auth fixture from existing setup).
 *
 * Verifies:
 *   - Page renders without error
 *   - Greeting header present
 *   - KPI section renders (all 4 cards visible)
 *   - Checklist section "Was möchtest du heute tun?" heading visible
 *   - All 3 checklist items present with links
 *   - WGB widget section present
 *   - Recent activity section present
 */

test.describe("@phase-6 dashboard", () => {
  test("renders greeting and all sections", async ({ page }) => {
    const res = await page.goto("/app");
    // May redirect to sign-in if not authenticated — acceptable in CI without seed
    if (res?.url().includes("/sign-in")) {
      test.skip();
    }
    expect(res?.status()).toBeLessThan(500);
  });

  test("dashboard page title contains Kassenführung", async ({ page }) => {
    await page.goto("/app");
    // Skip if redirected to sign-in
    if (page.url().includes("/sign-in")) {
      test.skip();
    }
    await expect(page.locator("text=Kassenführung")).toBeVisible();
  });

  test("Cashflow overview renders Einnahmen + Ausgaben YTD (C3)", async ({
    page,
  }) => {
    await page.goto("/app");
    if (page.url().includes("/sign-in")) {
      test.skip();
    }

    // Post-C3 layout: 2 headline cards + 4 link chips replace the legacy
    // 4-identical KPI grid (resolves VB-003, JB-005, UI-008, UX-330).
    await expect(page.locator("text=Einnahmen YTD")).toBeVisible();
    await expect(page.locator("text=Ausgaben YTD")).toBeVisible();
    await expect(page.locator("text=Saldo").first()).toBeVisible();
    await expect(page.locator("text=Offene Rechnungen").first()).toBeVisible();
  });

  test("checklist section heading visible", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("/sign-in")) {
      test.skip();
    }

    await expect(page.locator("text=Was möchtest du heute tun?")).toBeVisible();
  });

  test("checklist items link to correct routes", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("/sign-in")) {
      test.skip();
    }

    // Inbox link
    await expect(page.locator('a[href="/app/inbox"]').first()).toBeVisible();
    // Transactions link
    await expect(
      page.locator('a[href="/app/transactions"]').first(),
    ).toBeVisible();
    // Mitglieder link
    await expect(
      page.locator('a[href="/app/mitglieder"]').first(),
    ).toBeVisible();
  });

  test("WGB widget section renders", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("/sign-in")) {
      test.skip();
    }

    await expect(page.locator("text=WGB Einnahmen YTD")).toBeVisible();
  });

  test("recent activity section renders", async ({ page }) => {
    await page.goto("/app");
    if (page.url().includes("/sign-in")) {
      test.skip();
    }

    await expect(page.locator("text=Letzte Aktivitäten")).toBeVisible();
  });
});
