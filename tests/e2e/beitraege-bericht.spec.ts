/**
 * @phase-2 Kassenbericht /app/mitglieder/bericht/[year] (Task 3.5 / spec §11).
 *
 * Happy-path e2e: seeds a known state (2 paid, 1 open, 1 exempt), navigates
 * to the report, and asserts the per-member rows and totals render correctly.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
const ANCHOR = new Date().getFullYear();

const mA = "40000000-0000-0000-0000-0000000000b1"; // paid
const mB = "40000000-0000-0000-0000-0000000000b2"; // open
const mC = "40000000-0000-0000-0000-0000000000b3"; // per-year exempt
const mD = "40000000-0000-0000-0000-0000000000b4"; // paid

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

async function seedBericht(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
    { prepare: false, max: 1 },
  );
  try {
    await sql`DELETE FROM member_beitrags`;
    // Repoint any corpus member-paid rows to 'verein' before deleting members,
    // otherwise ON DELETE SET NULL would violate the bezahlt_von union CHECK
    // (expenses_bezahlt_von_union_ck / auslagen_submissions_bezahlt_von_union_ck).
    await sql`
      UPDATE expenses
         SET bezahlt_von_kind = 'verein',
             bezahlt_von_member_id = NULL,
             extern_name = NULL, extern_iban = NULL, extern_email = NULL
       WHERE bezahlt_von_member_id IS NOT NULL
    `;
    await sql`
      UPDATE auslagen_submissions
         SET bezahlt_von_kind = 'verein',
             bezahlt_von_member_id = NULL,
             extern_name = NULL, extern_iban = NULL, extern_email = NULL
       WHERE bezahlt_von_member_id IS NOT NULL
    `;
    await sql`DELETE FROM members`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${mA}, 'Alice',  'Bericht',  'a@b.test', 'mitglied', '2020-01-01', true),
        (${mB}, 'Bob',    'Bericht',  'b@b.test', 'mitglied', '2020-01-01', true),
        (${mC}, 'Carla',  'Bericht',  'c@b.test', 'mitglied', '2020-01-01', true),
        (${mD}, 'David',  'Bericht',  'd@b.test', 'mitglied', '2020-01-01', true)
    `;
    await sql`DELETE FROM beitragssatz_by_year WHERE year = ${ANCHOR}`;
    await sql`
      INSERT INTO beitragssatz_by_year (year, cents, faelligkeit_at)
      VALUES (${ANCHOR}, 7500, ${`${ANCHOR}-03-31`})
    `;
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am, is_exempt, exempt_reason)
      VALUES
        (${mA}, ${ANCHOR}, 7500, 7500, ${`${ANCHOR}-02-10`}, false, NULL),
        (${mB}, ${ANCHOR}, 7500, 0,    NULL,                  false, NULL),
        (${mC}, ${ANCHOR}, 7500, 0,    NULL,                  true,  'Härtefall'),
        (${mD}, ${ANCHOR}, 7500, 7500, ${`${ANCHOR}-03-01`}, false, NULL)
    `;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
  await seedBericht();
});

test.describe("@phase-2 Kassenbericht", () => {
  test("happy path: per-member rows and totals render correctly", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/app/mitglieder/bericht/${ANCHOR}`);
    await page.waitForLoadState("networkidle");

    // Heading
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`Kassenbericht Mitgliedsbeiträge ${ANCHOR}`),
      }),
    ).toBeVisible();

    // Per-member rows
    const rows = page.getByTestId("bericht-row");
    await expect(rows).toHaveCount(4);

    // Alice: paid
    const aliceRow = page
      .locator('[data-testid="bericht-row"][data-status="paid"]')
      .first();
    await expect(aliceRow).toBeVisible();
    await expect(aliceRow).toContainText("Bezahlt");

    // Bob: open
    const bobRow = page.locator(
      '[data-testid="bericht-row"][data-status="open"]',
    );
    await expect(bobRow).toBeVisible();
    await expect(bobRow).toContainText("Offen");

    // Carla: exempt
    const carlaRow = page.locator(
      '[data-testid="bericht-row"][data-status="exempt"]',
    );
    await expect(carlaRow).toBeVisible();
    await expect(carlaRow).toContainText("Befreit");
    await expect(carlaRow).toContainText("Härtefall");

    // Totals panel
    await expect(page.getByTestId("bericht-paid-count")).toContainText("2");
    await expect(page.getByTestId("bericht-open-count")).toContainText("1");

    // Paid sum: 2 × 75 € = 150,00 €
    await expect(page.getByTestId("bericht-paid-sum")).toContainText("150,00");

    // Open sum: 1 × 75 € = 75,00 €
    await expect(page.getByTestId("bericht-open-sum")).toContainText("75,00");
  });
});
