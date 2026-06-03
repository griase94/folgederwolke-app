/**
 * C5-MEM-lite — `memberBeitragsTotals(year)` helper for the Mitglieder-Matrix
 * €-summen header.
 *
 * Contract per the brief's DONE-TESTS (overrides the inline plan example):
 *   For a seed of 3 members where m1 paid 60€, m2 owes 60€ (unpaid), and m3
 *   was not yet billed (no member_beitrags row at all) the helper returns
 *   { memberCount: 3, paidCents: 6000, offenCents: 6000 } — literal values.
 *
 * `memberCount` is the total members table count (year-independent in this
 * shipment). `paidCents` / `offenCents` derive from `member_beitrags` rows
 * for the given year.
 *
 * Column names per `src/lib/server/db/schema/members.ts`:
 *   - `betrag_cents` (NOT due_cents)
 *   - `paid_cents`   (default 0)
 *   - `gezahlt_am`   (date paid, nullable — NOT bezahlt_am)
 */

import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { memberBeitragsTotals } from "$lib/server/domain/members";

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";

// Literal UUIDs so we can reference m1/m2/m3 in INSERTs and assertions.
const m1 = "10000000-0000-0000-0000-000000000001";
const m2 = "10000000-0000-0000-0000-000000000002";
const m3 = "10000000-0000-0000-0000-000000000003";

const SEED_YEAR = 2025;

describe.skipIf(!DIRECT_DATABASE_URL)("memberBeitragsTotals(year)", () => {
  let sql: ReturnType<typeof postgres>;
  // Number of fixture-seeded members already in the DB (austritts_datum
  // IS NULL) when this file starts. Captured once in beforeAll so each
  // test can assert deltas against it, instead of absolute counts that
  // would couple to the global seed shape. The seed currently ships 5
  // active fixture members but we don't hard-code that — read it.
  let baselineActiveCount = 0;

  beforeAll(async () => {
    // Capture the active-member baseline so memberCount assertions can
    // express deltas instead of absolutes.
    const probe = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      const rows = await probe<{ c: string }[]>`
        SELECT COUNT(*)::text AS c FROM members WHERE austritts_datum IS NULL
      `;
      baselineActiveCount = Number(rows[0]?.c ?? 0);
    } finally {
      await probe.end();
    }
  });

  beforeEach(async () => {
    sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    // Scoped cleanup: only delete OUR three test members (m1/m2/m3). Don't
    // TRUNCATE — the c1-eur-pdf-union + c1-eur-union-roundtrip tests
    // require fixture members from the global seed to still exist.
    // member_beitrags ON DELETE CASCADE removes related rows automatically.
    await sql`DELETE FROM members WHERE id IN (${m1}, ${m2}, ${m3})`;
    // Wipe ALL beitrags for SEED_YEAR so sum assertions count only the
    // beitrags this beforeEach inserts. c1-eur tests use different years
    // (2028 / 2031) so they're unaffected.
    await sql`DELETE FROM member_beitrags WHERE year = ${SEED_YEAR}`;
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role)
      VALUES
        (${m1}, 'Test', 'Member One',   'm1@example.test', 'mitglied'),
        (${m2}, 'Test', 'Member Two',   'm2@example.test', 'mitglied'),
        (${m3}, 'Test', 'Member Three', 'm3@example.test', 'mitglied')
    `;
    // Seed: 3 members. m1 paid 60€, m2 owes 60€ (gezahlt_am NULL), m3 not
    // yet billed (no row at all).
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
      VALUES
        (${m1}, ${SEED_YEAR}, 6000, 6000, ${`${SEED_YEAR}-05-01`}),
        (${m2}, ${SEED_YEAR}, 6000,    0, NULL)
    `;
    await sql.end();
  });

  afterAll(async () => {
    // Scoped cleanup so subsequent test files still see the global seed's
    // fixture members. Only the three rows we inserted leave with us.
    const cleanup = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await cleanup`DELETE FROM members WHERE id IN (${m1}, ${m2}, ${m3})`;
    } finally {
      await cleanup.end();
    }
  });

  it("returns memberCount + paidCents + offenCents from member_beitrags table", async () => {
    const totals = await memberBeitragsTotals(SEED_YEAR);
    // memberCount = active members (austritts_datum IS NULL). Cycle-2 fix:
    // discriminator is now paid_cents < betrag_cents, not gezahlt_am IS NULL.
    // We add 3 test members, none with austritts_datum, so the count grows
    // by exactly 3 from the seeded baseline.
    expect(totals.memberCount).toBe(baselineActiveCount + 3);
    expect(totals.paidCents).toBe(6000); // 60,00 €
    expect(totals.offenCents).toBe(6000); // 60,00 €
  });

  it("derives sums from DB (not hard-coded)", async () => {
    // Mutate seed: add a second 60€ paid row for m3 → paid should be 120,00 €.
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await mut`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
        VALUES (${m3}, ${SEED_YEAR}, 6000, 6000, ${`${SEED_YEAR}-05-15`})
      `;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    expect(totals.paidCents).toBe(12000);
  });

  it("handles partial payments: paid_cents=3000, betrag_cents=6000 → 30 € paid + 30 € offen", async () => {
    // Cycle-2 finding (vorstand + julia): the OLD discriminator
    // (gezahlt_am IS NULL) would misclassify this row as 60 € offen.
    // Correct semantic: paidCents += paid_cents (3000), offenCents +=
    // GREATEST(betrag_cents - paid_cents, 0) (3000).
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      // Wipe SEED_YEAR beitrags so only our partial row contributes.
      // (year-scoped to keep other tests' fixtures intact.)
      await mut`DELETE FROM member_beitrags WHERE year = ${SEED_YEAR}`;
      await mut`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
        VALUES (${m1}, ${SEED_YEAR}, 6000, 3000, NULL)
      `;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    expect(totals.paidCents).toBe(3000);
    expect(totals.offenCents).toBe(3000);
  });

  it("handles overpayment: paid_cents=7000, betrag_cents=6000 → 70 € paid + 0 € offen (GREATEST clamp)", async () => {
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await mut`DELETE FROM member_beitrags WHERE year = ${SEED_YEAR}`;
      await mut`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
        VALUES (${m1}, ${SEED_YEAR}, 6000, 7000, ${`${SEED_YEAR}-05-01`})
      `;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    expect(totals.paidCents).toBe(7000);
    // GREATEST(betrag_cents - paid_cents, 0) clamps the negative to 0.
    expect(totals.offenCents).toBe(0);
  });

  it("handles paid-without-gezahlt_am: paid_cents=betrag_cents but gezahlt_am NULL → still counts as paid", async () => {
    // The OLD discriminator would call this row "offen". The correct
    // semantic recognises full payment via paid_cents >= betrag_cents.
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await mut`DELETE FROM member_beitrags WHERE year = ${SEED_YEAR}`;
      await mut`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
        VALUES (${m1}, ${SEED_YEAR}, 6000, 6000, NULL)
      `;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    expect(totals.paidCents).toBe(6000);
    expect(totals.offenCents).toBe(0);
  });

  it("memberCount excludes members with austritts_datum (active-only denominator)", async () => {
    // Cycle-2 finding (vorstand): the original SQL used unfiltered
    // COUNT(*) FROM members. Active-only is the correct denominator so
    // ex-members don't dilute the "X von Y bezahlt" UI line.
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await mut`UPDATE members SET austritts_datum = '2024-12-31' WHERE id = ${m3}`;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    // baseline + 2 active test members (m1, m2; m3 just became inactive).
    expect(totals.memberCount).toBe(baselineActiveCount + 2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Night-2 C5-MEM-full — exempt-aware semantics
  //
  // The new `exemptCount` field counts active members with
  // `beitrag_exempt = true`. Exempt members are excluded from `offenCents`
  // (they don't owe anything) but their `paid_cents` for the year (if any
  // — e.g. they paid before being granted exemption) is preserved.
  // ─────────────────────────────────────────────────────────────────────────

  it("Night-2: exposes exemptCount and excludes exempt members from offenCents", async () => {
    // Mark m2 exempt mid-test. m2 owes 60€ in the SEED, but as exempt that
    // 60€ must NOT contribute to offenCents.
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await mut`UPDATE members SET beitrag_exempt = true,
                                    beitrag_exempt_reason = 'Ehrenmitglied'
                WHERE id = ${m2}`;
    } finally {
      await mut.end();
    }

    const totals = await memberBeitragsTotals(SEED_YEAR);

    // exemptCount is a NEW field on the aggregate (Night-2).
    expect(totals.exemptCount).toBe(1);

    // m1 fully paid 60€ → paidCents still 6000 (exempt status doesn't
    // erase prior payments).
    expect(totals.paidCents).toBe(6000);

    // m2's 60€ owed is now suppressed by their exempt flag → offenCents = 0.
    expect(totals.offenCents).toBe(0);
  });

  it("Night-2: exempt members still count toward memberCount (active denominator)", async () => {
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      // Migration 0028: beitrag_exempt_reason required when exempt=true (§55 AO)
      await mut`UPDATE members SET beitrag_exempt = true, beitrag_exempt_reason = 'Test-Befreiung' WHERE id IN (${m1}, ${m2})`;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    // m1/m2/m3 still active; exempt flag does NOT remove them from the
    // active-member count.
    expect(totals.memberCount).toBe(baselineActiveCount + 3);
    expect(totals.exemptCount).toBe(2);
  });

  it("Night-2: exemptCount excludes austritts_datum members (active-only)", async () => {
    // m3 is exempt AND austritts → should NOT appear in exemptCount
    // (we count exempt among ACTIVE members only).
    const mut = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      // Migration 0028: beitrag_exempt_reason required when exempt=true (§55 AO)
      await mut`UPDATE members
                SET beitrag_exempt = true,
                    beitrag_exempt_reason = 'Test-Befreiung',
                    austritts_datum = '2024-12-31'
                WHERE id = ${m3}`;
    } finally {
      await mut.end();
    }
    const totals = await memberBeitragsTotals(SEED_YEAR);
    expect(totals.exemptCount).toBe(0);
  });
});
