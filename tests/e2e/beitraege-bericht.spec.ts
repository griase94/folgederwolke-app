/**
 * @aurora-impl-c1 Kassenbericht /app/mitglieder/bericht/[year] (spec §11).
 *
 * Adapted to the 7-state resolver truth (C-S2): the Bericht status comes from
 * the canonical resolveBeitragState — the SAME source as the Matrix/Detail — so
 * an unpaid current-year member past Fälligkeit+grace reads as ÜBERFÄLLIG (not a
 * flat "Offen"), and a partial payment reads as TEILZAHLUNG. The behavioural
 * asserts (per-member states + totals) live on in that truth; PLUS a targeted
 * assert pinning the disjoint totals rule (§5: openSum = open+partial+overdue;
 * overdueSum = the "davon" subset). Erna (partial) makes that a REAL subset —
 * openSum (120,00) ⊋ overdueSum (75,00) — never accidental equality.
 *
 * Seed: Alice + David paid, Bob unpaid → overdue (Fälligkeit fixed in the past →
 * deterministically overdue on any run date), Erna partial (30,00 / 75,00),
 * Carla per-year exempt.
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
const mE = "40000000-0000-0000-0000-0000000000b5"; // partial (30,00 von 75,00)

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
        (${mD}, 'David',  'Bericht',  'd@b.test', 'mitglied', '2020-01-01', true),
        (${mE}, 'Erna',   'Bericht',  'e@b.test', 'mitglied', '2020-01-01', true)
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
        (${mD}, ${ANCHOR}, 7500, 7500, ${`${ANCHOR}-03-01`}, false, NULL),
        (${mE}, ${ANCHOR}, 7500, 3000, ${`${ANCHOR}-04-15`}, false, NULL)
    `;
  } finally {
    await sql.end();
  }
}

/** Extract the first "1.234,56" de-DE amount from an element's text as integer cents. */
async function readCents(
  locator: import("@playwright/test").Locator,
): Promise<number> {
  const text = (await locator.textContent()) ?? "";
  const m = text.match(/(\d{1,3}(?:\.\d{3})*),(\d{2})/);
  if (!m) throw new Error(`no de-DE amount in ${JSON.stringify(text)}`);
  return parseInt(m[1]!.replace(/\./g, ""), 10) * 100 + parseInt(m[2]!, 10);
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
  await seedBericht();
});

test.describe("@aurora-impl-c1 Kassenbericht", () => {
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

    // Five applicable rows.
    await expect(page.getByTestId("bericht-row")).toHaveCount(5);

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
    // No stale "open" row exists — overdue and partial are their own honest
    // states, never folded into a flat "Offen" row.
    await expect(
      page.locator('[data-testid="bericht-row"][data-status="open"]'),
    ).toHaveCount(0);

    // Erna: partial payment → TEILZAHLUNG, shown honestly as paid-of-Soll.
    const ernaRow = page.locator(
      '[data-testid="bericht-row"][data-status="partial"]',
    );
    await expect(ernaRow).toHaveCount(1);
    await expect(ernaRow).toContainText("Bericht, Erna");
    await expect(ernaRow).toContainText("Teilzahlung");
    await expect(ernaRow).toContainText("30,00");
    await expect(ernaRow).toContainText("75,00");

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

    // Offen (superset) = open + partial + OVERDUE outstanding → Bob (overdue,
    // 75,00) + Erna (partial, 75,00 − 30,00 = 45,00) = 2 members · 120,00 €.
    await expect(page.getByTestId("bericht-open-count")).toContainText("2");
    await expect(page.getByTestId("bericht-open-sum")).toContainText("120,00");

    // "davon überfällig" — the disjoint overdue SUBSET of the Offen bucket:
    // 1 member · 75,00 € (Bob only; Erna's partial is NOT overdue).
    const overdue = page.getByTestId("bericht-overdue-sum");
    await expect(overdue).toContainText("1");
    await expect(overdue).toContainText("75,00");

    // ── Disjoint-overdue invariant (§5, the sharp assert) ──────────────────
    // overdueSum is a *subset* of the Offen superset, shown as a "davon" line.
    // Erna's partial keeps the two distinct (120,00 ⊋ 75,00), so this pins the
    // real subset relation — not accidental equality. openSum − overdueSum is
    // exactly the partial member's outstanding rest (45,00). If the aggregation
    // ever folded overdue OUT of openSum, this equality would break.
    const openCents = await readCents(page.getByTestId("bericht-open-sum"));
    const overdueCents = await readCents(overdue);
    expect(openCents).toBe(12000);
    expect(overdueCents).toBe(7500);
    expect(openCents).toBeGreaterThan(overdueCents);
    expect(openCents - overdueCents).toBe(4500); // exactly Erna's outstanding rest
  });
});
