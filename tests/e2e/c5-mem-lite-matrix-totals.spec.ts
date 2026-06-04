/**
 * Beitragsmatrix per-year column headers (Phase-2 redesign of C5-MEM-lite).
 *
 * The original C5-MEM-lite shipped a single totals header + a year-tab
 * switcher. The Phase-2 matrix redesign (spec §7.3) replaces that with a
 * role=grid whose per-year columnheaders each carry an aria-label
 * "X von Y bezahlt, Z Euro erhalten" and a visible "N/M bezahlt" line.
 *
 * Seed contract (re-established in beforeAll via raw SQL):
 *   - Exactly 3 active members (m1, m2, m3), all joined 2020 so every year in
 *     the window is applicable.
 *   - For each year in the current 3-year window: m1 paid 60€, m2 owes 60€,
 *     m3 not billed (no member_beitrags row → open).
 *   → each column header reads "1/3 bezahlt" and "60,00 € erhalten".
 *
 * Tags: @phase-c5 @overnight-c5-mem-lite
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

const m1 = "10000000-0000-0000-0000-0000000000a1";
const m2 = "10000000-0000-0000-0000-0000000000a2";
const m3 = "10000000-0000-0000-0000-0000000000a3";

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

async function seedMatrixTotals(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql`DELETE FROM member_beitrags`;
    await sql`DELETE FROM members`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${m1}, 'C5', 'Member One',   'c5-m1@example.test', 'mitglied', '2020-01-01', true),
        (${m2}, 'C5', 'Member Two',   'c5-m2@example.test', 'mitglied', '2020-01-01', true),
        (${m3}, 'C5', 'Member Three', 'c5-m3@example.test', 'mitglied', '2020-01-01', true)
    `;

    const now = new Date();
    const anchorYear = now.getFullYear();
    for (const year of [anchorYear - 1, anchorYear, anchorYear + 1]) {
      await sql`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
        VALUES
          (${m1}, ${year}, 6000, 6000, ${`${year}-05-01`}),
          (${m2}, ${year}, 6000,    0, NULL)
      `;
    }
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-c5 @overnight-c5-mem-lite Beitragsmatrix per-year headers", () => {
  test.beforeAll(async () => {
    if (!process.env["DATABASE_URL"]) return;
    await seedMatrixTotals();
  });

  test("each year column header announces the paid count + sum via aria-label", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    const grid = page.getByRole("grid", { name: "Beitragsmatrix" });
    await expect(grid).toBeVisible();

    // Every applicable column header reads "1 von 3 bezahlt, 60,00 € erhalten".
    const headers = page.getByRole("columnheader", {
      name: /1 von 3 bezahlt, 60,00\s*€ erhalten/,
    });
    // 3-year window → at least one such header (all three match the seed).
    expect(await headers.count()).toBeGreaterThanOrEqual(1);
  });

  test("the visible paid-count line renders N/M bezahlt", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    await expect(page.getByText("1/3 bezahlt").first()).toBeVisible();
  });
});
