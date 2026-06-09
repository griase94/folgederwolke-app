/**
 * @phase-9 C9-JUL-lite — GoBD-Z3 export GRANT + isYearClosed honesty.
 *
 * Covers:
 *   1. /app/jahresabschluss/<year>/gobd-export HTML page returns 200 (the
 *      pre-fix prod 500 was "permission denied for view v_eur_year"
 *      because `app_runtime` had no SELECT on v_eur_year; fixed by
 *      migration 0017).
 *   2. /app/jahresabschluss/<year>/bundle.zip returns 200 with a ZIP whose
 *      file list contains the expected GoBD bundle entries (not just PK
 *      magic bytes — an empty 22-byte EOCD-only ZIP would pass the magic
 *      check).
 *   3. /app/jahresabschluss/2025/buchungsliste shows the "Erste Buchung
 *      anlegen" CTA when 2025 has no rows AND festgeschrieben_bis is
 *      unset (the honesty fix: pre-refactor `isYearClosed(2025)` returned
 *      true here because zero rows looked like all-closed rows).
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import JSZip from "jszip";

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

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 C9-JUL-lite GoBD-Z3 export + isYearClosed", () => {
  test("gobd-export HTML page returns 200 (v_eur_year GRANT applied)", async ({
    page,
  }) => {
    // Pre-fix: app_runtime had no SELECT on v_eur_year → the page server
    // loader's `SELECT count(*) FROM v_eur_year` threw "permission denied"
    // and SvelteKit returned 500. Migration 0017 grants the missing role.
    await signIn(page);
    const year = 2024;
    const res = await page.goto(`/app/jahresabschluss/${year}/gobd-export`);
    expect(res?.status()).toBe(200);
    // The page-level H1 carries the year — assert that, not the page-header
    // H1 which duplicates the breadcrumb.
    await expect(
      page.getByRole("heading", { level: 1, name: `GoBD-Z3 Export ${year}` }),
    ).toBeVisible();
  });

  test("bundle.zip returns 200 with valid ZIP and expected entries", async ({
    page,
  }) => {
    // The plan-tightened assertion: not just PK magic bytes (an empty
    // 22-byte EOCD-only ZIP would pass the magic check). Inspect the
    // central directory and assert the bundle's named entries are present.
    await signIn(page);
    const year = 2024;
    const response = await page.request.get(
      `/app/jahresabschluss/${year}/bundle.zip`,
    );
    expect(response.status()).toBe(200);
    const buf = await response.body();
    expect(buf.byteLength).toBeGreaterThan(100);

    // ZIP magic bytes — cheap sanity check.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);

    // File-list assertion via jszip (already in deps).
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    // The bundle always contains EÜR PDF + Anlage-Gem CSV + Spendenliste
    // CSV + Beleg-Index CSV. The PDF entry may be skipped if generation
    // fails, but the three CSVs are unconditional.
    expect(names).toContain(`02_Anlage-Gem-${year}.csv`);
    expect(names).toContain(`03_Spendenliste-${year}.csv`);
    expect(names).toContain(`04_Beleg-Index-${year}.csv`);
    expect(names.length).toBeGreaterThanOrEqual(3);
  });

  test("buchungsliste for empty year shows 'Erste Buchung anlegen' CTA", async ({
    page,
  }) => {
    // The isYearClosed honesty fix: pre-refactor, `isYearClosed` returned true
    // for an empty year (no rows matched the `festgeschrieben_at IS NULL`
    // filter) and hid this CTA in production. Post-refactor it derives from
    // settings.festgeschrieben_bis, which the test seed leaves unset.
    // Use a far-future year (2099) that is guaranteed empty in the test DB
    // and unaffected by the transaction corpus seeded for 2024-2026.
    await signIn(page);
    const res = await page.goto(`/app/jahresabschluss/2099/buchungsliste`);
    expect(res?.status()).toBe(200);
    await expect(
      page.locator('[data-testid="buchungsliste-empty-new-year"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Erste Buchung anlegen/i }),
    ).toBeVisible();
  });
});
