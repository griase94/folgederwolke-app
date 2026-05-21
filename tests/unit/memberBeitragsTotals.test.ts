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

import { describe, expect, it, beforeEach, afterAll } from "vitest";
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

  beforeEach(async () => {
    sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    // P1-B8 fix: explicit INSERTs replace the prior comment placeholder.
    // member_beitrags references members(id) ON DELETE CASCADE, so the
    // TRUNCATE … CASCADE cleans both tables in one shot.
    await sql`TRUNCATE members, member_beitrags RESTART IDENTITY CASCADE`;
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
    // Final cleanup so subsequent test files don't see our fake members.
    const cleanup = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    try {
      await cleanup`TRUNCATE members, member_beitrags RESTART IDENTITY CASCADE`;
    } finally {
      await cleanup.end();
    }
  });

  it("returns memberCount + paidCents + offenCents from member_beitrags table", async () => {
    const totals = await memberBeitragsTotals(SEED_YEAR);
    // memberCount = active members (austritts_datum IS NULL). Cycle-2 fix:
    // discriminator is now paid_cents < betrag_cents, not gezahlt_am IS NULL.
    expect(totals.memberCount).toBe(3);
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
      // Wipe existing member_beitrags so the single partial row is the only fact.
      await mut`TRUNCATE member_beitrags RESTART IDENTITY CASCADE`;
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
      await mut`TRUNCATE member_beitrags RESTART IDENTITY CASCADE`;
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
      await mut`TRUNCATE member_beitrags RESTART IDENTITY CASCADE`;
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
    expect(totals.memberCount).toBe(2);
  });
});
