/**
 * @phase-2 Beitragssatz-Einstellungen (Task 2.9 / spec §8).
 *
 *   - admin edits a year's rate inline → table reflects the new value
 *   - preview-impact panel shows betroffene Mitglieder + erwartete Einnahmen
 *   - festgeschriebenes Jahr shows "gesperrt" (edit disabled)
 *   - new-rate form adds a future year
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
const ANCHOR = new Date().getFullYear();

async function signIn(page: import("@playwright/test").Page): Promise<void> {
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
    VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
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

async function ensureRate(year: number, cents: number): Promise<void> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
    { prepare: false, max: 1 },
  );
  try {
    await sql`
      INSERT INTO beitragssatz_by_year (year, cents)
      VALUES (${year}, ${cents})
      ON CONFLICT (year) DO UPDATE SET cents = ${cents}
    `;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-2 Beitragssatz-Einstellungen", () => {
  test("admin edits a year's rate inline and the table reflects it", async ({
    page,
  }) => {
    // A non-festgeschrieben future year so the edit is allowed.
    const editYear = ANCHOR + 2;
    await ensureRate(editYear, 6969);

    await signIn(page);
    await page.goto("/app/einstellungen/beitraege");

    const row = page.locator(
      `[data-testid="rate-row"][data-year="${editYear}"]`,
    );
    await expect(row).toBeVisible();
    await row.getByTestId("edit-rate").click();

    const betrag = page.getByLabel("Betrag");
    await betrag.fill("80.00");

    // Preview panel updates live
    await expect(page.getByTestId("preview-betrag")).toHaveText(/80,00\s*€/);

    await page.getByRole("button", { name: "Speichern" }).click();

    // Table now shows 80,00 € for that year
    await expect(
      page.locator(`[data-testid="rate-row"][data-year="${editYear}"]`),
    ).toContainText(/80,00\s*€/, { timeout: 5000 });
  });

  test("new-rate form adds a future year", async ({ page }) => {
    const newYear = ANCHOR + 7;
    // Make sure it doesn't already exist.
    const { default: postgres } = await import("postgres");
    const sql = postgres(
      process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
      { prepare: false, max: 1 },
    );
    await sql`DELETE FROM beitragssatz_by_year WHERE year = ${newYear}`;
    await sql.end();

    await signIn(page);
    await page.goto("/app/einstellungen/beitraege");

    await page.getByTestId("add-rate-toggle").click();
    await page.locator('input[name="year"]').fill(String(newYear));
    await page.locator('input[name="betrag"]').first().fill("75.00");
    await page.getByRole("button", { name: "Speichern" }).click();

    await expect(
      page.locator(`[data-testid="rate-row"][data-year="${newYear}"]`),
    ).toBeVisible({ timeout: 5000 });
  });

  test("festgeschriebenes Jahr is locked (edit disabled)", async ({ page }) => {
    // 2024 is the year the year-switcher spec also festschreibt; using the same
    // value keeps the monotonic festgeschrieben_bis trigger happy and avoids
    // cross-test interference (matrix flows operate on the current year > 2024).
    const lockedYear = 2024;
    await ensureRate(lockedYear, 6000);
    const { default: postgres } = await import("postgres");
    const sql = postgres(
      process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
      { prepare: false, max: 1 },
    );
    // Monotonic trigger only forbids LOWERING. Raise to (at least) lockedYear.
    await sql`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${String(lockedYear)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = GREATEST(
        COALESCE(NULLIF(settings.value #>> '{}', 'null')::int, 0), ${lockedYear}
      )::text::jsonb
    `;
    await sql.end();

    await signIn(page);
    await page.goto("/app/einstellungen/beitraege");

    const row = page.locator(
      `[data-testid="rate-row"][data-year="${lockedYear}"]`,
    );
    await expect(row).toBeVisible();
    await expect(row.getByText("gesperrt")).toBeVisible();
    await expect(row.getByTestId("edit-rate")).toHaveCount(0);
  });
});
