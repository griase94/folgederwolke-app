/**
 * @phase-2 BeitragsuebersichtWidget enhancement (Task 2.10 / spec §6).
 *
 *   - overdue chip leads when overdue>0 and clicks through to ?filter=ueberfaellig
 *   - persistent success state at 100% paid (no emoji)
 *
 * The widget preserves the C4-DASH-lite testid contract; these tests target the
 * new states added in Phase 2.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
const ANCHOR = new Date().getFullYear();

const a = "30000000-0000-0000-0000-0000000000d1";
const b = "30000000-0000-0000-0000-0000000000d2";

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

async function seedOverdue(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
    { prepare: false, max: 1 },
  );
  try {
    await sql`DELETE FROM member_beitrags`;
    await sql`DELETE FROM members`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${a}, 'Dash', 'Overdue', 'dash-a@example.test', 'mitglied', '2020-01-01', true),
        (${b}, 'Dash', 'Paid',    'dash-b@example.test', 'mitglied', '2020-01-01', true)
    `;
    // Fälligkeit deep in the past so member a is overdue (past grace).
    await sql`
      INSERT INTO beitragssatz_by_year (year, cents, faelligkeit_at)
      VALUES (${ANCHOR}, 6969, '2000-03-31')
      ON CONFLICT (year) DO UPDATE SET faelligkeit_at = '2000-03-31'
    `;
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
      VALUES
        (${a}, ${ANCHOR}, 6969, 0, NULL),
        (${b}, ${ANCHOR}, 6969, 6969, ${`${ANCHOR}-02-01`})
    `;
  } finally {
    await sql.end();
  }
}

async function seedAllPaid(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
    { prepare: false, max: 1 },
  );
  try {
    await sql`DELETE FROM member_beitrags`;
    await sql`DELETE FROM members`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${a}, 'Dash', 'PaidOne', 'dash-a@example.test', 'mitglied', '2020-01-01', true),
        (${b}, 'Dash', 'PaidTwo', 'dash-b@example.test', 'mitglied', '2020-01-01', true)
    `;
    await sql`
      INSERT INTO beitragssatz_by_year (year, cents, faelligkeit_at)
      VALUES (${ANCHOR}, 6969, ${`${ANCHOR + 5}-03-31`})
      ON CONFLICT (year) DO UPDATE SET faelligkeit_at = ${`${ANCHOR + 5}-03-31`}
    `;
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
      VALUES
        (${a}, ${ANCHOR}, 6969, 6969, ${`${ANCHOR}-02-01`}),
        (${b}, ${ANCHOR}, 6969, 6969, ${`${ANCHOR}-05-15`})
    `;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-2 BeitragsuebersichtWidget", () => {
  test("shows the overdue chip and clicks through to the filtered matrix", async ({
    page,
  }) => {
    await seedOverdue();
    await signIn(page);
    await page.goto("/app");

    const chip = page.getByTestId("beitragsuebersicht-overdue");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/überfällig/);

    await page.getByTestId("beitragsuebersicht-widget").click();
    await expect(page).toHaveURL(/filter=ueberfaellig/);
  });

  test("shows the persistent success state when everyone has paid", async ({
    page,
  }) => {
    await seedAllPaid();
    await signIn(page);
    await page.goto("/app");

    await expect(page.getByText(/Alle 2 Mitglieder bezahlt/)).toBeVisible();
    // No overdue chip in the success state.
    await expect(page.getByTestId("beitragsuebersicht-overdue")).toHaveCount(0);
  });
});
