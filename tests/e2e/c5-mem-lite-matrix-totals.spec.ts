/**
 * C5-MEM-lite — Mitglieder-Matrix €-summen header.
 *
 * Verifies that opening /app/mitglieder?view=matrix renders the new header
 * line `{N} Mitglieder · {X €} offen · {Y €} bezahlt` with literal values
 * derived from the actual `member_beitrags` table state — not just a regex
 * check that "some numbers" are present.
 *
 * Seed contract (re-established in beforeAll via raw SQL):
 *   - Exactly 3 active members (m1, m2, m3).
 *   - For each of the years currently shown by the matrix window
 *     (anchor ± 1), m1 paid 60€ and m2 owes 60€ (gezahlt_am NULL).
 *     m3 stays "not yet billed" — no member_beitrags row.
 *   → header must read "3 Mitglieder · 60,00 € offen · 60,00 € bezahlt"
 *     regardless of which year tab is active.
 *
 * The header lives in `MemberMatrix.svelte` (per-year aggregates threaded
 * through from `+page.server.ts:totalsByYear`).
 *
 * Tags: @phase-c5 @overnight-c5-mem-lite
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

// Literal UUIDs so we can assert exact membership.
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

/**
 * Re-seed members + member_beitrags into the exact 3-member shape the brief
 * asserts on, WITHOUT TRUNCATE CASCADE. The FKs from auslagen_submissions /
 * donations / expenses → members are ON DELETE SET NULL, so a plain
 * DELETE FROM members preserves rows in those tables (with null member_id
 * where needed) — protecting downstream specs that share the seeded DB.
 *
 * `member_beitrags.member_id` is ON DELETE CASCADE so deleting members also
 * clears every beitrag row in one shot.
 *
 * Uses the superuser DIRECT_DATABASE_URL because the app_runtime role can't
 * delete fixture members that may be referenced elsewhere.
 */
async function seedMatrixTotals(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    // Wipe members in dependency-safe order — `member_beitrags` cascades.
    await sql`DELETE FROM member_beitrags`;
    await sql`DELETE FROM members`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role)
      VALUES
        (${m1}, 'C5', 'Member One',   'c5-m1@example.test', 'mitglied'),
        (${m2}, 'C5', 'Member Two',   'c5-m2@example.test', 'mitglied'),
        (${m3}, 'C5', 'Member Three', 'c5-m3@example.test', 'mitglied')
    `;

    // Seed each year of the current 3-year window so the header reads the
    // same literal values regardless of which tab is active. Mirrors the
    // brief's seed scenario one-to-one per year (m1 paid 60€, m2 owes 60€,
    // m3 not billed).
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

test.describe("@phase-c5 @overnight-c5-mem-lite C5-MEM-lite Beitrags-Matrix totals header", () => {
  test.beforeAll(async () => {
    if (!process.env["DATABASE_URL"]) return;
    await seedMatrixTotals();
  });

  test("header renders literal '3 Mitglieder · 60,00 € offen · 60,00 € bezahlt' for the seed", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    // Header element is rendered above the existing sort controls.
    const header = page.getByTestId("matrix-header-totals");
    await expect(header).toBeVisible();

    // Literal value assertions — not just regex presence.
    // (toHaveText collapses non-breaking spaces in Intl currency output to
    // regular spaces for matching, so the assertions stay portable.)
    await expect(page.getByTestId("matrix-header-mitglieder")).toHaveText(
      "3 Mitglieder",
    );
    await expect(page.getByTestId("matrix-header-offen")).toHaveText(
      "60,00 € offen",
    );
    await expect(page.getByTestId("matrix-header-bezahlt")).toHaveText(
      "60,00 € bezahlt",
    );
  });

  test("switching the year tab keeps the same literal seed values across the 3-year window", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    const tabs = page.getByTestId("matrix-year-tab");
    const tabCount = await tabs.count();
    expect(tabCount).toBe(3);

    const header = page.getByTestId("matrix-header-totals");

    // Click the LAST tab (anchorYear + 1) — seed covers all three years, so
    // the header literal values must NOT change.
    const lastTab = tabs.last();
    const tabYear = await lastTab.getAttribute("data-year");
    await lastTab.click();
    await expect(header).toHaveAttribute("data-year", tabYear!);

    await expect(page.getByTestId("matrix-header-mitglieder")).toHaveText(
      "3 Mitglieder",
    );
    await expect(page.getByTestId("matrix-header-offen")).toHaveText(
      "60,00 € offen",
    );
    await expect(page.getByTestId("matrix-header-bezahlt")).toHaveText(
      "60,00 € bezahlt",
    );
  });
});
