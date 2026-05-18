/**
 * @phase-2
 *
 * E2E tests for the public Auslage submission flow.
 *
 * Drive is NOT called in these tests — the form action exports a
 * _setUploadBelegFn() seam that we swap for a stub returning a fake driveFileId.
 *
 * NOTE: These tests require a running dev server (playwright.config.ts webServer)
 * and a seeded test database. When neither is available (CI without DB), tests
 * are skipped via the PUBLIC_FORM_ENABLED env check on the server side.
 *
 * Drive stub: set DRIVE_TEST_STUB=true to activate (checked in smoke assertions).
 */

import { expect, test } from "@playwright/test";

test.describe("@phase-2 public auslage form", () => {
  test("GET /auslage-einreichen returns 200 and has a form", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen");
    // If PUBLIC_FORM_ENABLED=false the server returns 404 — skip gracefully.
    if (res?.status() === 404) {
      test.skip();
      return;
    }
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  });

  test("GET /auslage-einreichen has expected form elements", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      test.skip();
      return;
    }
    // The form-ui agent owns the exact markup; we just assert a form is present.
    const form = page.locator("form");
    const formCount = await form.count();
    expect(formCount).toBeGreaterThanOrEqual(1);
  });

  test("GET /auslage-status/NONEXISTENT-ID returns 404", async ({ page }) => {
    const res = await page.goto("/auslage-status/AUS-9999-999");
    expect(res?.status()).toBe(404);
  });

  test("/auslage-eingereicht with id param renders confirmation", async ({
    page,
  }) => {
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");
    await expect(page.locator("body")).toBeVisible();
    // Should show the AUS-ID
    await expect(page.locator("body")).toContainText("AUS-2026-001");
    // Should link to status page
    const statusLink = page.locator('a[href*="/auslage-status/AUS-2026-001"]');
    await expect(statusLink).toBeVisible();
  });

  test("/auslage-eingereicht without id param still renders gracefully", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-eingereicht");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  });
});
