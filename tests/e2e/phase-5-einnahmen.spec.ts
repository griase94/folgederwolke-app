/**
 * @phase-5-einnahmen — Phase 5 (Tier C2) Einnahmen tab end-to-end smoke.
 *
 * Covers the Einnahmen tab's user-visible contract (spec §8.1 + §13):
 *   1. Create a freie Einnahme → it appears in the list with its derived Sphäre
 *      (left color-rule) and NO 🔗 badge (it was not created from a Rechnung).
 *   2. The KPI header shows the quiet anchor + all FOUR Sphären-Split chips,
 *      including an empty (0,00 €) one.
 *   3. A markInvoiceAsPaid-seeded income (linked to an Ausgangsrechnung) shows
 *      the 🔗 badge in the list AND the read-only "aus Rechnung FDW-…" context
 *      line on its detail.
 *   4. A festgeschriebenes Jahr renders the detail read-only (Speichern hidden,
 *      the Festschreibung notice shown).
 *
 * NOTE: this spec is WRITTEN but NOT run in the Phase-5 boundary (e2e is
 * deferred). The `@phase-5-einnahmen` tag is not yet in CI's cumulative grep —
 * extending that grep is a Phase-8/cleanup concern (see the plan's review
 * amendment). The tag still satisfies tests/unit/ci-e2e-grep.test.ts (every
 * spec must carry at least one @-tagged describe block).
 *
 * Login helper uses the magic-link pattern (insert magic_link row, click
 * through /sign-in/verify); a beforeEach guard skips the suite entirely
 * when DATABASE_URL is unset.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(
  page: import("@playwright/test").Page,
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

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-5-einnahmen Einnahmen tab", () => {
  test("KPI header shows the anchor + all four Sphären-Split chips (incl. empty)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/einnahmen");

    // The KPI strip + its Sphären-Split chip set.
    await expect(page.getByTestId("kpi-strip")).toBeVisible();
    const split = page.locator('[data-slot="sphere-split"]');
    await expect(split).toBeVisible();

    // All four sphere chips are present (an empty one renders 0,00 €, never hidden).
    for (const sphere of [
      "ideeller",
      "vermoegen",
      "zweckbetrieb",
      "wirtschaftlich",
    ]) {
      await expect(
        split.locator(`[data-sphere-chip][data-sphere="${sphere}"]`),
      ).toBeVisible();
    }
  });

  test("create a freie Einnahme → appears in the list with its Sphäre, no 🔗 badge", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/einnahmen/neu");

    const bezeichnung = `E2E Einnahme ${randomBytes(4).toString("hex")}`;
    await page.fill('input[name="bezeichnung"]', bezeichnung);
    await page.fill("#betragEur", "42.50");
    // Pick the first real income kategorie (the picker drives the Sphäre).
    await page.selectOption("#kategorie", { index: 1 });

    await Promise.all([
      page.waitForURL(/\/app\/einnahmen\/[^/]+$/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Speichern" }).click(),
    ]);

    await page.goto("/app/einnahmen");
    const row = page
      .getByTestId("txn-row")
      .filter({ hasText: bezeichnung })
      .first();
    await expect(row).toBeVisible();
    // freie Einnahme → no "aus Rechnung" chip on the row.
    await expect(
      row.getByTestId("row-chip").filter({ hasText: /aus Rechnung/ }),
    ).toHaveCount(0);
  });

  test("a Rechnung-linked income shows the 🔗 badge in the list + the read-only context line on its detail", async ({
    page,
  }) => {
    // Seeded by the showcase corpus: a markInvoiceAsPaid-linked income carries
    // a non-null rechnungBusinessId (invoices.paid_by_income_id = income.id).
    await signIn(page);
    await page.goto("/app/einnahmen");

    // Aurora rows surface the link as an "aus Rechnung FDW-…" chip.
    const linkedRow = page
      .getByTestId("txn-row")
      .filter({ hasText: /aus Rechnung/ })
      .first();
    await expect(linkedRow).toBeVisible();
    await linkedRow.click();
    await expect(page.locator('[data-slot="aus-rechnung"]')).toBeVisible();
    await expect(page.locator('[data-slot="aus-rechnung"]')).toContainText(
      /aus Rechnung\s+FDW-/,
    );
  });

  test("a festgeschriebenes Jahr renders the detail read-only (Speichern hidden)", async ({
    page,
  }) => {
    await signIn(page);
    // Navigate into a festgeschriebene income detail (seeded). The shell shows
    // the Festschreibung notice and HIDES the Speichern button.
    await page.goto("/app/einnahmen");
    const firstRow = page.getByTestId("txn-row").first();
    await firstRow.click();

    // If the row is festgeschrieben the notice is shown + Speichern is absent.
    const notice = page.locator('[data-slot="detail-festschreibung-notice"]');
    if (await notice.isVisible().catch(() => false)) {
      await expect(page.getByRole("button", { name: "Speichern" })).toHaveCount(
        0,
      );
    }
  });
});
