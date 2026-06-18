/**
 * @phase-9 C2-TAX required gates
 *
 * Verifies that the tax-correctness gates fire in the rendered UI:
 *   - AuslagenForm: submit disabled until Beleg + Rechnungsdatum filled
 *   - /app/ausgaben/neu: Beleg, Rechnungsdatum, Abfluss-Datum
 *     are required at the HTML level (the `required` attribute blocks submit)
 *   - /app/ausgaben/neu: bezahlt_von defaults to 'verein'
 *
 * The Spende kategorieNameSnapshot derivation is verified by a unit test
 * indirectly (action drives the snapshot from the kategorie list); a full e2e
 * for that would require a real Drive upload + redirect — out of scope for
 * the gate-spec which focuses on input-level requireds.
 */

import { test, expect, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
    `;
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ]);
  } finally {
    await client.end();
  }
}

test.describe("@phase-9 C2-TAX required gates", () => {
  test("AuslagenForm: submit blocked without Beleg", async ({ page }) => {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      throw new Error(
        "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off in .env.test.",
      );
    }
    await page.waitForLoadState("networkidle");

    // Fill bezeichnung + Betrag — leave Beleg empty.
    await page.getByLabel(/was war.s/i).fill("Test ohne Beleg");
    await page.getByLabel(/betrag in euro/i).fill("12,50");
    // Rechnungsdatum defaults to today in the form; keep it.

    // The submit button must be disabled because Beleg is missing.
    const submit = page.getByTestId("auslage-submit");
    await expect(submit).toBeDisabled();
  });

  test("ausgaben/neu submit blocked without Beleg (client+server gate, not native required)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu"); // Phase 8 T6: per-tab neu
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/sign-in")) test.skip();

    await page.getByLabel(/bezeichnung/i).fill("Test");
    // Betrag is a type=text inputmode=decimal field (mobile keyboard fix) —
    // locate by its label, not the old input[type=number] selector.
    await page.getByLabel(/betrag/i).fill("10");
    // Fill the date fields so only Beleg is missing.
    // C6-FORM (Night-2 E4): the date inputs are now DateField primitives — they
    // accept TT.MM.JJJJ display text and commit ISO to the hidden mirror onBlur.
    const rechnungs = page.getByLabel(/rechnungsdatum/i);
    await rechnungs.fill("01.05.2026");
    await rechnungs.blur();
    const abfluss = page.getByLabel(/abfluss-datum/i);
    await abfluss.fill("02.05.2026");
    await abfluss.blur();
    // Beleg deliberately left empty.

    // The Beleg redesign replaced the native `required` (a hidden custom-dropzone
    // file input can't surface a focusable validation bubble — it would silently
    // block submit with no message) with a client+server gate: submitting without
    // a Beleg arm keeps the form on the same page and shows a Beleg-required
    // error (server 422 → BelegUpload field error + form.error banner).
    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await expect(page).toHaveURL(/\/app\/ausgaben\/neu/);
    await expect(
      page
        .getByText(
          /Beleg.*(erforderlich|hochladen)|Begründung.*(erforderlich|wählen)/i,
        )
        .first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("/transactions/neu kind=ausgabe Abfluss-Datum is required", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu"); // Phase 8 T6: per-tab neu
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/sign-in")) test.skip();

    // C6-FORM (Night-2 E4): after the DateField migration the visible text
    // input is what carries `required` (the hidden ISO mirror lacks it). We
    // pin to the visible input by id and assert the required attribute is
    // present (HTML serialises a bare `required` attribute as empty string).
    const abfluss = page.locator("input#abfluss_datum");
    await expect(abfluss).toHaveAttribute("required", "");
  });

  test("/transactions/neu kind=ausgabe bezahlt_von defaults to Verein", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu"); // Phase 8 T6: per-tab neu
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/sign-in")) test.skip();

    // The hidden input named bezahltVonKind carries the selected kind; we
    // marked it with data-testid="bezahlt-von-kind" so the e2e can read it
    // without depending on the visible-button visual styling.
    const hidden = page.getByTestId("bezahlt-von-kind");
    await expect(hidden).toHaveValue("verein");
  });

  test("/transactions/neu kind=ausgabe Rechnungsdatum is required", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu"); // Phase 8 T6: per-tab neu
    await page.waitForLoadState("networkidle");
    if (page.url().includes("/sign-in")) test.skip();

    // C6-FORM (Night-2 E4): after the DateField migration the visible text
    // input is what carries `required`; pin by id.
    const rechnungs = page.locator("input#rechnungsdatum");
    await expect(rechnungs).toHaveAttribute("required", "");
  });
});
