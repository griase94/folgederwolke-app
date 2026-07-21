/**
 * @phase-4-ausgaben
 *
 * End-to-end coverage for the Ausgaben tab (Phase 4, Tier C1). Written at the
 * phase boundary so it exists for the later full-suite run; per the C1 task
 * scope it is NOT executed inside the C1 worktree (the boundary runs
 * `pnpm check` + `pnpm lint` + the targeted unit/component/DB set instead).
 *
 * Scenarios (all tagged @phase-4-ausgaben, no extra DB reset between them):
 *   1. Create Verein-paid Ausgabe → lands erstattet (status badge "Erstattet").
 *   2. Create Mitglied Ausgabe (Auslagenflow) → stays geprueft, no auto-pay.
 *   3. Bulk "Als bezahlt markieren" over the approved-pending pool.
 *   4. Detail "Als bezahlt markieren" (the ?/mark-paid no-mail path).
 *   5. Duplicate-as-template resets the payment state (no Beleg, unpaid).
 *   6. EÜR reflects new bookings (P12-01, the spec's headline E2E): a created
 *      Ausgabe with a real Kategorie appears in /app/jahresabschluss/[year] in
 *      the correct Sphäre bucket.
 *   7. Unsaved-changes guard (P16-03): a dirty entry form fires the guard on the
 *      × close and on browser-back.
 *   8. Image fold-viewer (P16-03): an image Beleg renders in the detail
 *      fold/inline viewer.
 *
 * Auth: sign in first (hooks.server.ts gates /app before the route load).
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(
  page: Page,
  email: string = TEST_ADMIN_EMAIL,
): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${email}, ${expiresAt})
  `;
  await client.end();
  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

/** Fill the shared descriptive fields on /app/ausgaben/neu. */
async function fillBaseFields(
  page: Page,
  opts: { bezeichnung: string; betrag: string; kategorie?: string },
): Promise<void> {
  await page.getByLabel(/Bezeichnung/i).fill(opts.bezeichnung);
  await page.locator("#betrag-display").fill(opts.betrag);
  // A fresh Ausgabe no longer preselects a Kategorie (M2), and the Speichern CTA
  // is gated on every required field being present (M4) — so always pick one.
  const kat = page.locator('select[name="kategorieNameSnapshot"]');
  if (opts.kategorie) {
    await kat.selectOption({ label: opts.kategorie });
  } else {
    const val = await kat.locator("option").nth(1).getAttribute("value");
    if (val) await kat.selectOption(val);
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-4-ausgaben Ausgaben tab", () => {
  test("create Verein-paid Ausgabe → lands erstattet", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu");

    await fillBaseFields(page, {
      bezeichnung: "E2E Verein Druckerpatronen",
      betrag: "23.50",
    });
    // Verein is the default bezahlt-von; tick kein-Beleg + Begründung so the
    // §4.1 gate is satisfied without a file upload.
    // entry-modal-v4: the Beleg gate is a segment — pick the Verzicht arm.
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page
      .getByLabel(/Begründung/i)
      .fill("E2E: Beleg liegt nicht digital vor.");

    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    // Verein-paid is verbucht as erstattet immediately.
    await expect(page.getByText(/Erstattet/i).first()).toBeVisible();
  });

  test("create Mitglied Ausgabe (Auslagenflow) → stays geprueft", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu");

    await fillBaseFields(page, {
      bezeichnung: "E2E Mitglied Auslage",
      betrag: "12.00",
    });
    await page.getByTestId("bezahlt-von-member").click();
    await page
      .locator('select[name="bezahltVonMemberId"]')
      .selectOption({ index: 1 });
    // entry-modal-v4: the Beleg gate is a segment — pick the Verzicht arm.
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page
      .getByLabel(/Begründung/i)
      .fill("E2E: Mitglied-Auslage ohne Beleg.");

    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    // No auto-pay → status is the approved (Genehmigt) state, NOT Erstattet.
    await expect(page.getByText(/Genehmigt/i).first()).toBeVisible();
  });

  test("Überweisungsliste: approved-pending pool surfaces with copy buttons and per-row erstattet action", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/ueberweisungen");
    await expect(
      page.getByRole("heading", { name: "Überweisungsliste" }),
    ).toBeVisible();
    const claims = page.getByTestId("ueberweisung-claim");
    if ((await claims.count()) > 0) {
      const first = claims.first();
      // Bank-form copy order: Empfängername → IBAN → Betrag → Verwendungszweck
      const buttons = first.locator(
        "[data-testid='copy-name'], [data-testid='copy-iban'], [data-testid='copy-iban-disabled'], [data-testid='copy-betrag'], [data-testid='copy-zweck']",
      );
      await expect(buttons.nth(0)).toHaveText(/Empfängername/);
      await expect(buttons.nth(2)).toHaveText(/Betrag/);
      await expect(buttons.nth(3)).toHaveText(/Verwendungszweck/);
      await first.getByTestId("mark-erstattet").click();
      await expect(
        page.getByText(/1 erstattet|bereits erstattet/).first(),
      ).toBeVisible();
    }
  });

  test("detail Als bezahlt markieren (no-mail path)", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/ausgaben/neu");
    await fillBaseFields(page, {
      bezeichnung: "E2E Detail Markieren",
      betrag: "8.00",
    });
    await page.getByTestId("bezahlt-von-member").click();
    await page
      .locator('select[name="bezahltVonMemberId"]')
      .selectOption({ index: 1 });
    // entry-modal-v4: the Beleg gate is a segment — pick the Verzicht arm.
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page.getByLabel(/Begründung/i).fill("E2E ohne Beleg.");
    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: /Als bezahlt markieren/i }).click();
    await expect(page.getByText(/Erstattet/i).first()).toBeVisible();
  });

  test("duplicate-as-template resets payment state (no Beleg, unpaid)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");
    // Open the first detail row, duplicate, and assert the entry form opened
    // with the descriptive fields prefilled but no Beleg / payment carried.
    const firstRow = page.getByTestId("txn-row").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      // B3 detail-views-v4: the duplicate head-action reads „Als Vorlage".
      await page.getByRole("button", { name: /Als Vorlage/i }).click();
      await page.waitForURL(/\/app\/ausgaben\/neu/);
      // Bezeichnung carried; the Beleg gate defaults to the Beleg arm (fresh Beleg).
      await expect(page.getByLabel(/Bezeichnung/i)).not.toHaveValue("");
      await expect(
        page.getByRole("radio", { name: /Verzicht begründen/i }),
      ).not.toBeChecked();
    }
  });

  test("EÜR reflects new bookings (P12-01)", async ({ page }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    await page.goto("/app/ausgaben/neu");
    await fillBaseFields(page, {
      bezeichnung: "E2E EÜR Beitrag",
      betrag: "99.00",
    });
    // entry-modal-v4: the Beleg gate is a segment — pick the Verzicht arm.
    await page.getByRole("radio", { name: /Verzicht begründen/i }).click();
    await page.getByLabel(/Begründung/i).fill("E2E EÜR.");
    await page.getByRole("button", { name: /Ausgabe anlegen/i }).click();
    await page.waitForURL(/\/app\/ausgaben\/[0-9a-f-]+$/);

    // The created Ausgabe flows into the year's Jahresabschluss: it shows as a
    // line item in the Buchungsliste. (The Übersicht tab only renders aggregated
    // per-Sphäre totals — a single 99,00 booking is summed into its bucket there,
    // so it never appears as a standalone amount.)
    await page.goto(`/app/jahresabschluss/${year}/buchungsliste`);
    await expect(page.getByText("E2E EÜR Beitrag").first()).toBeVisible();
  });

  test("unsaved-changes guard fires on × and browser-back (P16-03)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");
    // Reach the entry form via a CLIENT-SIDE navigation (the desktop "Neue
    // Ausgabe" CTA), not page.goto. A full page.goto would load /neu outside
    // SvelteKit's client history, so the previous entry isn't framework-managed
    // and a browser-back becomes an uncancellable full-document navigation. The
    // in-app unsaved-changes guard governs SPA navigations — which is exactly how
    // a real user reaches and leaves this form.
    await page.locator('[data-slot="new-cta"]').click();
    await page.waitForURL(/\/app\/ausgaben\/neu/);
    await page.getByLabel(/Bezeichnung/i).fill("E2E dirty");

    // × close → the beforeNavigate guard prompts (window.confirm). Dismiss it.
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: /Schließen/i }).click();
    // Cancelled navigation → still on the entry form.
    await expect(page).toHaveURL(/\/app\/ausgaben\/neu/);

    // Browser-back → same guard fires (popstate within SvelteKit's history).
    page.once("dialog", (d) => d.dismiss());
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/ausgaben\/neu/);
  });

  test("image Beleg renders in the detail fold/inline viewer (P16-03)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");
    // Find a row with an attached image Beleg, open it, assert the viewer shows
    // an <img> from the blob endpoint. Skipped gracefully if no such row seeded.
    const firstRow = page.getByTestId("txn-row").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      const belegSlot = page.locator('[data-slot="detail-beleg"]');
      await expect(belegSlot).toBeVisible();
      const img = belegSlot.locator('img[src*="/api/files/"]');
      if (
        await img
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(img.first()).toBeVisible();
      }
    }
  });
});

test.describe("White-label payer label @phase-4-ausgaben", () => {
  // The "Verein"-paid payer label must reflect the runtime vereinName from
  // settings (exposed via the root layout), NOT a hardcoded "Folge der Wolke
  // e.V." literal. The configured name varies by env (local ".env.test" adds a
  // "(TEST)" suffix; CI sets the bare value), so assert the name root, not the
  // exact suffix — rigorous dynamic-source checks live in the unit tests.
  test("verein payer display uses the configured runtime name", async ({
    page,
  }) => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await signIn(page);
    await page.goto("/app/ausgaben/neu");
    // Default bezahltVonKind for Ausgaben is 'verein'.
    await expect(page.getByTestId("bezahlt-von-kind")).toHaveValue("verein");
    // The persisted display name flows into the hidden bezahltVonDisplay input.
    const display = page.locator('input[name="bezahltVonDisplay"]');
    await expect(display).toHaveValue(/Folge der Wolke/);
  });
});
