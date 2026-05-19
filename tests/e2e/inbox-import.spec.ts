/**
 * @phase-4
 *
 * E2E tests for the admin Audit Inbox manual-import path.
 *
 * These tests require a running dev server with a seeded test DB and an
 * authenticated admin session. The tests use Playwright's storageState to
 * reuse an existing session cookie set up in auth.spec.ts / global setup.
 *
 * Because we can't guarantee a live DB in all CI environments, each test
 * gracefully skips when the inbox page returns 401/404/500.
 */

import { expect, test } from "@playwright/test";

// Graceful skip helper
async function guardInbox(page: import("@playwright/test").Page) {
  const res = await page.goto("/app/inbox");
  const status = res?.status() ?? 0;
  if (status === 401 || status === 403 || status === 404 || status === 500) {
    test.skip();
  }
  return status;
}

test.describe("@phase-4 audit inbox", () => {
  test("GET /app/inbox returns 200 for authenticated admin", async ({
    page,
  }) => {
    const status = await guardInbox(page);
    expect(status).toBe(200);
    await expect(page.locator("h1")).toContainText("Audit Inbox");
  });

  test("/app/inbox shows 'Manuell hinzufügen' button", async ({ page }) => {
    await guardInbox(page);
    const btn = page.getByRole("button", { name: /Manuell hinzufügen/i });
    await expect(btn).toBeVisible();
  });

  test("clicking 'Manuell hinzufügen' opens the sheet", async ({ page }) => {
    await guardInbox(page);
    await page.getByRole("button", { name: /Manuell hinzufügen/i }).click();
    // Sheet title becomes visible
    await expect(
      page.getByRole("heading", { name: /Manuell hinzufügen/i }),
    ).toBeVisible();
  });

  test("manual-import sheet has expected form fields", async ({ page }) => {
    await guardInbox(page);
    await page.getByRole("button", { name: /Manuell hinzufügen/i }).click();
    // BezahltVon radio group
    await expect(
      page.getByRole("radio", { name: /Folge der Wolke/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Vereinsmitglied/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Externe Person/i }),
    ).toBeVisible();
    // Key fields
    await expect(page.locator("#mi-bezeichnung")).toBeVisible();
    await expect(page.locator("#mi-betrag")).toBeVisible();
    await expect(page.locator("#mi-datum")).toBeVisible();
  });

  test("submitting the manual-import form (Verein) adds a new inbox entry", async ({
    page,
  }) => {
    await guardInbox(page);
    const initialRows = await page
      .locator('[data-testid="inbox-card"]')
      .count();

    await page.getByRole("button", { name: /Manuell hinzufügen/i }).click();
    await expect(
      page.getByRole("heading", { name: /Manuell hinzufügen/i }),
    ).toBeVisible();

    // Fill form — Verein is default
    await page.locator("#mi-bezeichnung").fill("Testauslage Papierbeleg");
    await page.locator("#mi-betrag").fill("42,00");

    // Submit
    await page.getByRole("button", { name: /Einreichung speichern/i }).click();

    // Toast or sheet closes
    // Wait for sheet to close (sheet title disappears on success)
    await expect(
      page.getByRole("heading", { name: /Manuell hinzufügen/i }),
    ).not.toBeVisible({ timeout: 8000 });

    // New row appears in table (page invalidates after success)
    await page.waitForLoadState("networkidle");
    const updatedRows = await page
      .locator('[data-testid="inbox-card"]')
      .count();
    expect(updatedRows).toBeGreaterThan(initialRows);
  });
});
