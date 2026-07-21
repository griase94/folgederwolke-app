/**
 * @aurora-impl-b4kulisse
 *
 * Kulisse (B-Kulisse) — the /neu entry dialogs render OVER the real list as an
 * inert stage, so a deep-link lands on „list + open dialog" and a click from the
 * list keeps the list standing behind the scrim.
 *
 * Smoke scope (the routing/layout invariant only — the entry-form contracts
 * themselves stay covered by @aurora-impl-b2 / @phase-entry-modals / @phase-4/5/6):
 *   1. Deep-link /app/ausgaben/neu → the entry dialog AND an inert, aria-hidden
 *      list backdrop (data-slot="entry-kulisse") both render; the backdrop is the
 *      real list (it carries the list's „Neue Ausgabe" CTA) and the dialog is a
 *      sibling portal, not nested inside the inert stage.
 *   2. Click „Neue Einnahme" from the list → same Kulisse (the list is the stage).
 *
 * Auth: magic-link sign-in via the shared loginAs helper.
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@aurora-impl-b4kulisse Kulisse", () => {
  test("deep-link /app/ausgaben/neu renders the list as an inert stage behind the dialog", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    // The entry dialog is open (portaled to body).
    const dialog = page.locator('[data-slot="entry-form-shell"]');
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // The list renders as the backdrop: present, inert, and hidden from AT.
    const kulisse = page.locator('[data-slot="entry-kulisse"]');
    await expect(kulisse).toHaveCount(1);
    await expect(kulisse).toHaveAttribute("aria-hidden", "true");
    await expect(
      page.locator('[data-slot="entry-kulisse"][inert]'),
    ).toHaveCount(1);

    // It is the REAL list — it carries the list's „Neue Ausgabe" CTA + KPI strip.
    await expect(kulisse.locator('[data-slot="new-cta"]')).toHaveCount(1);
    await expect(kulisse.getByTestId("kpi-strip")).toBeVisible();

    // The dialog is a SIBLING portal, never nested inside the inert stage
    // (otherwise its controls would be inert too).
    await expect(kulisse.locator('[data-slot="entry-form-shell"]')).toHaveCount(
      0,
    );
  });

  test("clicking Neue Einnahme from the list keeps the list as the stage", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/einnahmen");
    // Client-side navigation from the list (mirrors a real user).
    await page.locator('[data-slot="new-cta"]').click();
    await page.waitForURL(/\/app\/einnahmen\/neu/);

    await expect(page.locator('[data-slot="entry-form-shell"]')).toBeVisible();
    const kulisse = page.locator('[data-slot="entry-kulisse"]');
    await expect(kulisse).toHaveCount(1);
    await expect(
      page.locator('[data-slot="entry-kulisse"][inert]'),
    ).toHaveCount(1);
    await expect(kulisse.locator('[data-slot="new-cta"]')).toHaveCount(1);
  });

  test("stage continuity: a sorted list carries its query into /neu and back on close", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    // Open a SORTED list (the Betrag lens the Judge flagged).
    await page.goto("/app/ausgaben?sort=betrag&dir=asc");
    // Client-side click → the Neu CTA must carry the list query onto /neu so the
    // backdrop opens already in the user's sort (no visible re-shuffle).
    await page.locator('[data-slot="new-cta"]').click();
    await page.waitForURL(/\/app\/ausgaben\/neu\?/);
    await expect(page).toHaveURL(/sort=betrag/);
    await expect(page).toHaveURL(/dir=asc/);
    await expect(page.locator('[data-slot="entry-form-shell"]')).toBeVisible();

    // Close (Abbrechen) → the SAME sort query is replayed onto the list, so the
    // user lands back on exactly the list they opened from.
    await page.getByRole("button", { name: /^Abbrechen$/i }).click();
    await page.waitForURL(/\/app\/ausgaben\?/);
    await expect(page).not.toHaveURL(/\/neu/);
    await expect(page).toHaveURL(/sort=betrag/);
    await expect(page).toHaveURL(/dir=asc/);
  });
});
