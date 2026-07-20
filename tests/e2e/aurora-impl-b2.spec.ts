/**
 * @aurora-impl-b2
 *
 * Erfassen-Kette on entry-modal-v4 — the Buchen-flow capture chain.
 *
 * Scenarios:
 *   1. Deep-link /app/ausgaben/neu opens the entry dialog (over the list
 *      context) with the type-badge, the type-coloured Speichern CTA and the
 *      advisory gate-line reading amber („Fehlt noch …") while incomplete.
 *   2. Anlage-Rundlauf via the Beleg-oder-Verzicht segment: picking „Verzicht
 *      begründen" + a Begründung flips the gate-line green („Alles da.") and the
 *      form submits (redirect away from /neu).
 *   3. Dirty-guard: the new footer Abbrechen button, reached via a client-side
 *      navigation, triggers the unsaved-changes confirm.
 *
 * Auth: magic-link sign-in via the shared loginAs helper.
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

async function fillBase(
  page: import("@playwright/test").Page,
  opts: { bezeichnung: string; betrag: string },
): Promise<void> {
  await page.locator("#bezeichnung").fill(opts.bezeichnung);
  await page.locator("#betrag-display").fill(opts.betrag);
  const select = page.locator('select[name="kategorieNameSnapshot"]');
  const val = await select.locator("option").nth(1).getAttribute("value");
  if (val) await select.selectOption(val);
}

test.describe("@aurora-impl-b2 Erfassen-Kette", () => {
  // ── 1. Deep-link opens the dialog with plate chrome ───────────────────────
  test("deep-link /app/ausgaben/neu opens the entry dialog over the list", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    const dialog = page.locator('[data-slot="entry-form-shell"]');
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(dialog).toHaveAttribute("role", "dialog");

    // Header type-badge (plum Ausgabe glyph) is present.
    await expect(page.locator('[data-slot="entry-typebadge"]')).toBeVisible();

    // Speichern CTA carries the type label (never a generic "Speichern" here).
    await expect(
      page.getByRole("button", { name: /Ausgabe anlegen/i }),
    ).toBeVisible();

    // The advisory gate-line reads amber (data-ok=false) while required fields
    // are still missing.
    const gate = page.locator('[data-slot="entry-gate-line"]');
    await expect(gate).toBeVisible();
    await expect(gate).toHaveAttribute("data-ok", "false");
    await expect(gate).toContainText(/Fehlt noch/i);
  });

  // ── 2. Beleg-Verzicht gate round-trip → gate green → submit ───────────────
  test("Beleg-Verzicht gate: fills flip the gate-line green and the form submits", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben/neu");

    await fillBase(page, {
      bezeichnung: "B2 Verzicht-Rundlauf",
      betrag: "7,50",
    });

    // Pick the Verzicht arm of the Beleg gate (segment, not a checkbox).
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page.locator("#beleg-begruendung").fill("B2: kein digitaler Beleg.");

    // With every required field satisfied the gate-line flips green.
    const gate = page.locator('[data-slot="entry-gate-line"]');
    await expect(gate).toHaveAttribute("data-ok", "true", { timeout: 5_000 });
    await expect(gate).toContainText(/Alles da/i);

    // Submit → redirect away from /neu (into the detail or list).
    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await expect(page).not.toHaveURL(/\/app\/ausgaben\/neu/, {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/app\/ausgaben/, { timeout: 15_000 });
  });

  // ── 3. Dirty-guard fires from the footer Abbrechen button ─────────────────
  test("dirty-guard: Abbrechen prompts when the form has unsaved changes", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/ausgaben");
    // Reach /neu via a client-side navigation so the in-app beforeNavigate guard
    // governs the exit (a hard goto would be a full-document navigation).
    await page.locator('[data-slot="new-cta"]').click();
    await page.waitForURL(/\/app\/ausgaben\/neu/);

    await page.locator("#bezeichnung").fill("B2 dirty");

    // Abbrechen → the unsaved-changes confirm prompts; dismiss it.
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: /^Abbrechen$/i }).click();
    await expect(page).toHaveURL(/\/app\/ausgaben\/neu/);
  });
});
