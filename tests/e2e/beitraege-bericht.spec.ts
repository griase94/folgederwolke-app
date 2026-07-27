/**
 * @phase-2 Kassenbericht /app/mitglieder/bericht/[year] (spec §11).
 *
 * Adapted to the 7-state resolver truth (C-S2): the Bericht status comes from
 * the canonical resolveBeitragState — the SAME source as the Matrix/Detail — so
 * an unpaid current-year member past Fälligkeit+grace reads as ÜBERFÄLLIG, not a
 * flat "Offen". The behavioural asserts (per-member states + totals) live on in
 * that truth; PLUS a targeted assert pinning the disjoint totals rule
 * (§5: openSum = open+partial+overdue; overdueSum = the "davon" subset).
 *
 * Seed: Alice paid, Bob unpaid (Fälligkeit fixed in the past → deterministically
 * overdue on any run date), Carla per-year exempt, David paid.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
const ANCHOR = new Date().getFullYear();
// Fälligkeit comfortably in the past (120 days > the 60-day default grace) so
// Bob is overdue regardless of when the suite runs — the 7-state truth we pin,
// never a run-date-dependent flip between open/overdue.
const FAELLIG = new Date(Date.now() - 120 * 86_400_000)
  .toISOString()
  .slice(0, 10);

const mA = "40000000-0000-0000-0000-0000000000b1"; // paid
const mB = "40000000-0000-0000-0000-0000000000b2"; // overdue (unpaid, past Fälligkeit)
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
      VALUES (${ANCHOR}, 7500, ${FAELLIG})
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
  test("per-member states + disjoint totals render in the 7-state truth", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/app/mitglieder/bericht/${ANCHOR}`);
    await page.waitForLoadState("networkidle");

    // Semantic document heading (h1 on the paper sheet).
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`Kassenbericht Mitgliedsbeiträge ${ANCHOR}`),
      }),
    ).toBeVisible();

    // Four applicable rows.
    await expect(page.getByTestId("bericht-row")).toHaveCount(4);

    // Alice + David: paid (two rows).
    await expect(
      page.locator('[data-testid="bericht-row"][data-status="paid"]'),
    ).toHaveCount(2);

    // Bob: unpaid current-year past Fälligkeit → ÜBERFÄLLIG (NOT a flat "Offen").
    // This is the load-bearing 7-state adaptation.
    const bobRow = page.locator(
      '[data-testid="bericht-row"][data-status="overdue"]',
    );
    await expect(bobRow).toHaveCount(1);
    await expect(bobRow).toContainText("Bericht, Bob");
    await expect(bobRow).toContainText("Überfällig");
    // No stale "open" row exists — overdue is its own honest state.
    await expect(
      page.locator('[data-testid="bericht-row"][data-status="open"]'),
    ).toHaveCount(0);

    // Carla: per-year exempt with the stored Grund.
    const carlaRow = page.locator(
      '[data-testid="bericht-row"][data-status="exempt"]',
    );
    await expect(carlaRow).toHaveCount(1);
    await expect(carlaRow).toContainText("Befreit");
    await expect(carlaRow).toContainText("Härtefall");

    // ── Totals (§5 disjoint rule) ────────────────────────────────────────────
    // Paid: 2 members · 2 × 75 € = 150,00 €.
    await expect(page.getByTestId("bericht-paid-count")).toContainText("2");
    await expect(page.getByTestId("bericht-paid-sum")).toContainText("150,00");

    // Offen = open + partial + OVERDUE outstanding → Bob is counted here even
    // though his row reads Überfällig: 1 member · 75,00 €.
    await expect(page.getByTestId("bericht-open-count")).toContainText("1");
    await expect(page.getByTestId("bericht-open-sum")).toContainText("75,00");

    // "davon überfällig" — the disjoint overdue SUBSET of the Offen bucket:
    // 1 member · 75,00 € (here == the whole Offen bucket, since Bob is the only
    // outstanding member and he is overdue). Pins openSum ⊇ overdueSum.
    await expect(page.getByTestId("bericht-overdue-sum")).toContainText("1");
    await expect(page.getByTestId("bericht-overdue-sum")).toContainText(
      "75,00",
    );
  });
});
