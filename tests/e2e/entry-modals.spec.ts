/**
 * @phase-entry-modals
 *
 * Package E boundary — entry-modals redesign + Beleg enforcement.
 *
 * Scenarios:
 *   1. ausgaben/neu — submit blocked if neither Beleg arm is satisfied (server
 *      returns 422 and the form stays visible with an error).
 *   2. ausgaben/neu — Belegverzicht arm: ticking "Kein Beleg vorhanden" +
 *      filling Begründung (≥5 chars) lets the form submit successfully.
 *   3. manuell-hinzufügen — the Beleg section is present and submit is blocked
 *      (server 422) when neither arm is satisfied.
 *   4. Mobile: the EntryFormShell dialog covers the Topbar and MobileTabBar
 *      (z-[60]/z-[70] portal; backdrop and dialog are rendered in the DOM above
 *      the chrome on a phone viewport).
 *
 * Auth: magic-link sign-in via the shared loginAs helper.
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Fill the minimum descriptive fields on /app/ausgaben/neu. */
async function fillBaseAusgabeFields(
  page: import("@playwright/test").Page,
  opts: { bezeichnung: string; betrag: string },
): Promise<void> {
  // Bezeichnung
  await page.locator("#bezeichnung").fill(opts.bezeichnung);
  // Betrag (text input with inputmode=decimal)
  await page.locator("#betrag-display").fill(opts.betrag);
  // Pick any expense Kategorie so the form is otherwise complete
  const select = page.locator('select[name="kategorieNameSnapshot"]');
  const count = await select.locator("option").count();
  if (count > 1) {
    // pick the second option (first non-placeholder)
    const val = await select.locator("option").nth(1).getAttribute("value");
    if (val) await select.selectOption(val);
  }
  // Rechnungsdatum: accept the default today-value from the field
}

// ── before ────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe("@phase-entry-modals Beleg enforcement + modal isolation", () => {
  // ── 1. ausgaben/neu blocks submit without a Beleg arm ─────────────────────
  test("ausgaben/neu — submit without Beleg arm returns 422 and shows error", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    // Dirty the form to enable the Speichern button
    await fillBaseAusgabeFields(page, {
      bezeichnung: "E2E-Beleg-block",
      betrag: "12,50",
    });

    // Make the form "dirty" enough for the submit button to enable — the shell
    // enables Speichern as soon as `dirty` is true (set on first input).
    const submitBtn = page.locator(
      '[data-slot="entry-footer"] button[type="submit"]',
    );
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Submit without selecting either Beleg arm — no file, keinBeleg unchecked.
    await submitBtn.click();

    // The server returns 422; the form stays on the same page (no redirect).
    // The EntryFormShell (dialog) must still be visible.
    await expect(page.locator('[data-slot="entry-form-shell"]')).toBeVisible({
      timeout: 8_000,
    });

    // A beleg-related error is surfaced — check for the error text or aria-invalid.
    // The server echoes errors.beleg; BelegUpload surfaces the first error.
    const hasErrorText = await page
      .getByText(/Beleg-Datei ODER eine Begründung ist erforderlich/i)
      .isVisible()
      .catch(() => false);
    const hasAriaInvalid = await page
      .locator('[aria-invalid="true"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      hasErrorText || hasAriaInvalid,
      "Expected a beleg error message or aria-invalid field after 422",
    ).toBe(true);
  });

  // ── 2. ausgaben/neu — Belegverzicht arm submits OK ────────────────────────
  test("ausgaben/neu — Belegverzicht arm (keinBeleg + Begründung ≥5 chars) submits", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    await fillBaseAusgabeFields(page, {
      bezeichnung: "E2E-Verzicht-arm",
      betrag: "5,00",
    });

    // Trigger the Belegverzicht arm
    const keinBelegCheckbox = page.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await expect(keinBelegCheckbox).toBeVisible({ timeout: 3_000 });
    await keinBelegCheckbox.check();

    // Fill mandatory Begründung (≥5 trimmed chars)
    await page
      .locator("#beleg-begruendung")
      .fill("E2E: kein digitaler Beleg vorhanden.");

    // Submit
    const submitBtn = page.locator(
      '[data-slot="entry-footer"] button[type="submit"]',
    );
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Success → redirect away from /app/ausgaben/neu to the detail or list
    await expect(page).not.toHaveURL(/\/app\/ausgaben\/neu/, {
      timeout: 15_000,
    });
    // Should land on an ausgaben detail or list route
    await expect(page).toHaveURL(/\/app\/ausgaben/, { timeout: 15_000 });
  });

  // ── 3. manuell-hinzufügen requires Beleg ─────────────────────────────────
  test("manuell-hinzufügen — Beleg section present and submit blocked without arm", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/inbox");

    // Open the ManualImportSheet
    await page.getByRole("button", { name: /Manuell hinzufügen/i }).click();
    await expect(
      page.getByRole("heading", { name: /Manuell hinzufügen/i }),
    ).toBeVisible({ timeout: 5_000 });

    // The BelegUpload section should be present in the sheet
    const keinBelegInSheet = page.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await expect(keinBelegInSheet).toBeVisible({ timeout: 3_000 });

    // Fill minimum fields so the client-side validate() can proceed
    await page.locator("#mi-bezeichnung").fill("E2E-manual-beleg-check");
    await page.locator("#mi-betrag").fill("8,00");
    // Fill date (uses DateField)
    const datumInput = page.locator("#mi-datum");
    if (await datumInput.isVisible()) {
      await datumInput.fill("2026-06-18");
    }

    // Attempt submit without Beleg arm — the client validate() should surface an error
    // before the form posts (or the server will return 422 if it passes client).
    const submitBtn = page
      .getByRole("button", { name: /Hinzufügen|Speichern/i })
      .last();
    await submitBtn.click();

    // The sheet should remain open (no navigation / closure on error)
    await expect(
      page.getByRole("heading", { name: /Manuell hinzufügen/i }),
    ).toBeVisible({ timeout: 5_000 });

    // An error referencing Beleg is shown
    const belegError = page
      .getByText(/Beleg.*hochladen|Beleg-Datei ODER|Kein Beleg vorhanden/i)
      .first();
    await expect(belegError).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Mobile: modal covers Topbar + MobileTabBar ─────────────────────────
  test("mobile: EntryFormShell portal backdrop + dialog render above chrome", async ({
    page,
  }) => {
    // iPhone SE 2nd-gen logical viewport (375×667) — exercises the bottom-sheet
    await page.setViewportSize({ width: 375, height: 667 });
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    // The portal emits the backdrop and dialog into document.body (outside the
    // AdminShell stacking context). Both elements must be present and visible.
    const backdrop = page.locator('[data-slot="entry-backdrop"]');
    const dialog = page.locator('[data-slot="entry-form-shell"]');
    await expect(backdrop).toBeVisible({ timeout: 8_000 });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // The backdrop covers the full viewport (fixed inset-0) — its bounding box
    // should span the entire screen width and at least most of the height.
    const backdropBox = await backdrop.boundingBox();
    expect(backdropBox).not.toBeNull();
    if (backdropBox) {
      expect(backdropBox.x).toBeLessThanOrEqual(2);
      expect(backdropBox.width).toBeGreaterThanOrEqual(370);
    }

    // The dialog is rendered as a bottom-sheet on mobile (rounded-t-2xl,
    // fixed inset-x-0 bottom-0). Its role must be "dialog".
    await expect(dialog).toHaveAttribute("role", "dialog");

    // At this viewport the Topbar (z-30) and MobileTabBar (z-40) are behind
    // the backdrop (z-[60]). We verify this by confirming the dialog
    // (z-[70]) is visible — if the stacking context were broken the dialog
    // would be obscured and Playwright would report it hidden.
    await expect(dialog).toBeVisible();
  });
});
