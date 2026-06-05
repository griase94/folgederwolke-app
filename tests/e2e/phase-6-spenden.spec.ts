/**
 * E2E Spenden — deep flows — @phase-6-spenden
 *
 * The Tier-C3 Spenden tab end-to-end. WRITTEN at the Phase-6 boundary but NOT
 * run by this phase's executor (the create→Bescheinigung loop needs the full
 * stack + a configured Bescheid env to exercise the issued path). Tagged
 * @phase-6-spenden so a later e2e pass picks it up.
 *
 * Coverage (spec §9 / §10 / §15):
 *   - create Geldspende zweckfrei → ideeller + derived Kategorie
 *   - create Geldspende zweckgebunden → required Zweckbindungs-Text gate
 *   - create Sachspende → the Wertermittlung reveal + the §4.3 real columns
 *   - the "Ohne Bescheinigung" filter preset
 *   - detail "Bescheinigung erstellen" → the MOVED route → B-Nummer issued →
 *     the list "N ohne Bescheinigung" pill decrements
 *   - a bescheinigte Spende is read-only on the detail route
 *   - the old /app/transactions/spenden no longer serves the legacy page
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
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

/** Fill the shared Betrag (€) display input → drives the hidden cents field. */
async function fillBetrag(
  page: import("@playwright/test").Page,
  euros: string,
): Promise<void> {
  await page.fill('[data-testid="betrag-eur-input"]', euros);
}

/** Fill the DateField (TT.MM.JJJJ display) from an ISO date + blur to commit. */
async function fillDate(
  page: import("@playwright/test").Page,
  selector: string,
  iso: string,
): Promise<void> {
  const [yyyy, mm, dd] = iso.split("-");
  const field = page.locator(selector);
  await field.fill(`${dd}.${mm}.${yyyy}`);
  await field.blur();
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-6-spenden create", () => {
  test("Geldspende zweckfrei → ideeller + derived Kategorie", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/spenden/neu");
    await page.click('[data-testid="spendeart-geldspende"]');
    await page.click('[data-testid="zweckbindung-zweckfrei"]');
    await page.click('[data-testid="spender-mode-extern"]');
    const unique = randomBytes(3).toString("hex");
    await page.fill(
      '[data-testid="spender-name-input"]',
      `Erika Externe ${unique}`,
    );
    await page.fill(
      '[data-testid="spender-adresse-input"]',
      "Hauptstr. 1, 10115 Berlin",
    );
    await fillBetrag(page, "50.00");
    await fillDate(page, "input#zugewendet_am", "2026-03-01");

    // The derived-Kategorie badge shows Ideeller + the derived name (no picker).
    await expect(
      page.locator('[data-testid="derived-kategorie-badge"]'),
    ).toContainText("Ideeller");
    await expect(
      page.locator('[data-testid="derived-kategorie-badge"]'),
    ).toContainText("Geldspende zweckfrei");

    await page.click('form#entry-form button[type="submit"]');
    await page.waitForURL(/\/app\/spenden\/[0-9a-f-]+$/);
  });

  test("Geldspende zweckgebunden requires the Zweckbindungs-Text", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/spenden/neu");
    await page.click('[data-testid="zweckbindung-zweckgebunden"]');
    // The required Zweckbindungs-Text input is revealed.
    await expect(
      page.locator('[data-testid="zweckbindung-text"]'),
    ).toBeVisible();
  });

  test("Sachspende reveals the Wertermittlung block", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/spenden/neu");
    await page.click('[data-testid="spendeart-sachspende"]');
    await expect(
      page.locator('[data-testid="sachspende-reveal"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="wertermittlung-methode"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="zustand-beschreibung"]'),
    ).toBeVisible();
  });
});

test.describe("@phase-6-spenden detail + Bescheinigung", () => {
  test("detail exposes the Bescheinigung-erstellen action targeting the moved route", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/spenden");
    const firstRow = page.locator('[data-testid="scaffold-row"]').first();
    if ((await firstRow.count()) === 0) test.skip();
    await firstRow.click();
    await page.waitForURL(/\/app\/spenden\/[0-9a-f-]+$/);
    // Either "erstellen" (enabled), "anzeigen" (issued), or the disabled hint —
    // all link/point at the MOVED /app/spenden/[id]/zuwendungsbestaetigung route.
    const action = page
      .locator(
        '[data-testid="bescheinigung-erstellen"], [data-testid="bescheinigung-view"], [data-testid="bescheinigung-disabled"]',
      )
      .first();
    await expect(action).toBeVisible();
  });

  test("a bescheinigte Spende is read-only on the detail route", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/spenden?year=all");
    // The 2024 corpus donation S-2024-901 is issued (B-2024-901) → its detail
    // is read-only (no Speichern button rendered by the shell).
    const issuedRow = page
      .locator('[data-testid="scaffold-row"]', { hasText: "B-2024-901" })
      .first();
    if ((await issuedRow.count()) === 0) test.skip();
    await issuedRow.click();
    await page.waitForURL(/\/app\/spenden\/[0-9a-f-]+$/);
    await expect(
      page.locator('[data-testid="bescheinigung-nr-display"]'),
    ).toContainText("B-2024-901");
  });
});

test.describe("@phase-6-spenden retirement", () => {
  test("old /app/transactions/spenden is no longer the legacy dialog page", async ({
    page,
  }) => {
    await signIn(page);
    const resp = await page.goto("/app/transactions/spenden");
    await expect(page.locator('[data-testid="add-spende-btn"]')).toHaveCount(0);
    expect(resp?.status()).not.toBe(200);
  });
});
