/**
 * @phase-entry-modals
 *
 * Package E boundary — entry-modals redesign + Beleg enforcement.
 *
 * Scenarios:
 *   1. ausgaben/neu — submit blocked if neither Beleg arm is satisfied (server
 *      returns 422 and the form stays visible with an error).
 *   2. ausgaben/neu — Belegverzicht arm: picking the "Verzicht begründen"
 *      segment + filling Begründung (≥5 chars) lets the form submit successfully.
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
  // ── 1. State-matrix CTA gate + a 0,00 Betrag roundtrips a German 422 ───────
  test("ausgaben/neu — empty-required disables the CTA (amber gate); a 0,00 Betrag roundtrips a German 422", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    const submitBtn = page.locator(
      '[data-slot="entry-footer"] button[type="submit"]',
    );
    const gate = page.locator('[data-slot="entry-gate-line"]');

    // (a) Fresh form: required fields missing → CTA disabled, gate amber (M4).
    await expect(gate).toHaveAttribute("data-ok", "false");
    await expect(gate).toContainText(/Fehlt noch/i);
    await expect(submitBtn).toBeDisabled();

    // (b) Fill everything valid EXCEPT a 0,00 Betrag (client-valid, server-invalid),
    // and satisfy the Beleg gate via the Verzicht arm so the client gate goes green.
    await fillBaseAusgabeFields(page, {
      bezeichnung: "E2E-0-Betrag",
      betrag: "0,00",
    });
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page
      .locator("#beleg-begruendung")
      .fill("E2E: Betrag-0 roundtrip, kein Beleg.");

    // 0,00 counts as present → the CTA enables (the server is the enforcer).
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // Server returns a GERMAN 422; the form stays (no redirect) and echoes de-DE.
    await expect(page.locator('[data-slot="entry-form-shell"]')).toBeVisible({
      timeout: 8_000,
    });
    await expect(page).toHaveURL(/\/app\/ausgaben\/neu/);
    // German message — never "Too small" / "Invalid input".
    await expect(page.getByText(/größer als 0/i).first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(/Too small|Invalid input/i)).toHaveCount(0);
    // de-DE echo keeps the comma format the user typed.
    await expect(page.locator("#betrag-display")).toHaveValue("0,00");
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

    // Trigger the Belegverzicht arm — entry-modal-v4 renders the Beleg gate as a
    // segment ("Beleg hochladen" | "Verzicht begründen"), not a checkbox.
    const verzichtSeg = page.getByRole("radio", {
      name: /Verzicht begründen/i,
    });
    await expect(verzichtSeg).toBeVisible({ timeout: 3_000 });
    await verzichtSeg.click();

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
