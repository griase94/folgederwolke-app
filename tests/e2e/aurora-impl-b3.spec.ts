/**
 * @aurora-impl-b3
 *
 * B3 Detail-Kette smoke — the transaction detail is a read-by-default FULL PAGE
 * (detail-views-v4), no longer a modal. Testid-only + seed-resilient:
 *   1. Read-by-default: the money head + Verlauf render, NO editable form in the
 *      DOM; „Bearbeiten" reveals the ?/save form (id=detail-form) + the typed
 *      Speichern.
 *   2. Edit mode exposes the staged DeleteConfirm.
 *
 * Auth: magic-link sign-in via the shared loginAs helper.
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@aurora-impl-b3 Detail-Kette (read-by-default full page)", () => {
  test("ausgabe detail opens read-by-default; Bearbeiten reveals the edit form", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben");
    const row = page.getByTestId("txn-row").first();
    if ((await row.count()) === 0) test.skip();
    await row.click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    // Read-by-default: the full page + money head render; NO editable form yet.
    await expect(page.locator('[data-slot="detail-page"]')).toBeVisible();
    await expect(page.locator('[data-slot="detail-amount"]')).toBeVisible();
    await expect(page.locator("#detail-form")).toHaveCount(0);

    // „Bearbeiten" is a deliberate mode → the ?/save form + typed Speichern appear.
    const editBtn = page.locator('[data-slot="detail-edit-btn"]');
    if ((await editBtn.count()) === 0) test.skip(); // locked row (festgeschr./bescheinigt)
    await editBtn.click();
    await expect(page.locator("#detail-form")).toBeVisible();
    await expect(page.locator('[data-slot="detail-save-btn"]')).toBeVisible();
  });

  test("edit mode exposes the staged delete confirm", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben");
    const row = page.getByTestId("txn-row").first();
    if ((await row.count()) === 0) test.skip();
    await row.click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    const editBtn = page.locator('[data-slot="detail-edit-btn"]');
    if ((await editBtn.count()) === 0) test.skip();
    await editBtn.click();
    await page.locator('[data-slot="detail-delete-btn"]').click();
    await expect(page.locator('[data-slot="delete-confirm"]')).toBeVisible();
    await expect(
      page.locator('[data-slot="delete-confirm-submit"]'),
    ).toBeVisible();
  });

  test("the Verlauf timeline renders on the read detail", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben");
    const row = page.getByTestId("txn-row").first();
    if ((await row.count()) === 0) test.skip();
    await row.click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);
    await expect(page.locator('[data-slot="detail-verlauf"]')).toBeVisible();
  });
});
