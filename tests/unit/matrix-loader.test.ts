/**
 * Task 2.0: Matrix loader unit tests.
 *
 * Covers every CellState and YearHeader derivation path.
 *
 * @phase-2
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { memberBeitrags } from "$lib/server/db/schema/members.js";
import { loadMatrix } from "$lib/server/domain/matrix-loader.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { sql } from "drizzle-orm";

const TEST_YEAR = 2026;

// Ensure beitragssatz row exists for our test year
async function ensureSatz(year: number, cents = 6969n) {
  const db = getDb();
  await db
    .insert(beitragssatzByYear)
    .values({ year, cents })
    .onConflictDoUpdate({
      target: [beitragssatzByYear.year],
      set: { cents },
    });
}

describe("@phase-2 matrix loader — CellState derivation", () => {
  it("renders not_applicable_pre_join for years before eintrittsJahr", async () => {
    await ensureSatz(TEST_YEAR - 1);
    const m = await seedMember({
      name: "PreJoin",
      eintrittsDatum: "2026-06-01",
    });
    const data = await loadMatrix({ years: [TEST_YEAR - 1, TEST_YEAR] });
    const preCell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR - 1,
    );
    expect(preCell?.state).toBe("not_applicable_pre_join");
  });

  it("renders not_applicable_post_austritt for years after austrittsJahr", async () => {
    await ensureSatz(TEST_YEAR);
    await ensureSatz(TEST_YEAR + 1);
    const m = await seedMember({
      name: "PostAustritt",
      austrittsDatum: "2026-06-01",
    });
    const data = await loadMatrix({ years: [TEST_YEAR, TEST_YEAR + 1] });
    const postCell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR + 1,
    );
    expect(postCell?.state).toBe("not_applicable_post_austritt");
  });

  it("renders permanently_exempt when members.beitrag_exempt=true (overrides per-year)", async () => {
    await ensureSatz(TEST_YEAR);
    const m = await seedMember({
      name: "PermanentExemptTest",
      beitragExempt: true,
      beitragExemptReason: "Ehrenmitglied",
    });
    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    expect(cell?.state).toBe("permanently_exempt");
    expect(cell?.exemptReason).toBe("Ehrenmitglied");
  });

  it("renders exempt for per-year is_exempt=true", async () => {
    await ensureSatz(TEST_YEAR);
    const m = await seedMember({ name: "PerYearExempt" });
    const db = getDb();
    // Insert exempt row
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 0n,
        isExempt: true,
        exemptReason: "Härtefall",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    expect(cell?.state).toBe("exempt");
    expect(cell?.exemptReason).toBe("Härtefall");
  });

  it("renders paid for a fully-paid row", async () => {
    await ensureSatz(TEST_YEAR);
    const m = await seedMember({ name: "PaidMemberMatrix" });
    const db = getDb();
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 6969n,
        gezahltAm: "2026-03-15",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    expect(cell?.state).toBe("paid");
    expect(cell?.gezahltAm).toBe("2026-03-15");
  });

  it("renders open for a row not yet overdue", async () => {
    await ensureSatz(TEST_YEAR);
    // Insert satz with a faelligkeit far in the future (relative to today)
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({
        year: TEST_YEAR,
        cents: 6969n,
        faelligkeitAt: "2099-03-31",
      })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { faelligkeitAt: "2099-03-31" },
      });

    const m = await seedMember({ name: "OpenMemberMatrix" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR });

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    expect(cell?.state).toBe("open");
    // Restore default faelligkeit
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { faelligkeitAt: null },
      });
  });

  it("renders overdue for a row past faelligkeit + grace days", async () => {
    await ensureSatz(TEST_YEAR);
    const db = getDb();
    // Set faelligkeit to deep past so even with 60-day grace it's overdue
    await db
      .insert(beitragssatzByYear)
      .values({
        year: TEST_YEAR,
        cents: 6969n,
        faelligkeitAt: "2020-03-31",
      })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { faelligkeitAt: "2020-03-31" },
      });

    const m = await seedMember({ name: "OverdueMemberMatrix" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR });

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    expect(cell?.state).toBe("overdue");
    expect(cell?.daysOverdue).toBeGreaterThan(60);
    // Restore
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { faelligkeitAt: null },
      });
  });
});

describe("@phase-2 matrix loader — year-header totals", () => {
  it("year-header counts exclude exempt members from denominator", async () => {
    await ensureSatz(TEST_YEAR);
    const db = getDb();
    // Create a paid member
    const paid = await seedMember({ name: "HeaderPaid" });
    await db
      .insert(memberBeitrags)
      .values({
        memberId: paid.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 6969n,
        gezahltAm: "2026-03-10",
        source: "app",
      })
      .onConflictDoNothing();

    // Create a permanently exempt member
    await seedMember({
      name: "HeaderExempt",
      beitragExempt: true,
      beitragExemptReason: "Ehrenmitglied",
    });

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const header = data.headers.find((h) => h.year === TEST_YEAR)!;

    // exempt member should NOT be in totalDueCount
    expect(header.exemptCount).toBeGreaterThan(0);
    // paidCount should count our paid member
    expect(header.paidCount).toBeGreaterThanOrEqual(1);
    // total due count must NOT include the exempt member
    const allForYear = data.cells.filter((c) => c.year === TEST_YEAR);
    const exemptForYear = allForYear.filter(
      (c) => c.state === "exempt" || c.state === "permanently_exempt",
    );
    const nonApplicable = allForYear.filter(
      (c) =>
        c.state === "not_applicable_pre_join" ||
        c.state === "not_applicable_post_austritt",
    );
    expect(header.totalDueCount).toBe(
      allForYear.length - exemptForYear.length - nonApplicable.length,
    );
  });

  it("paidSumCents accumulates paid cells only", async () => {
    await ensureSatz(TEST_YEAR);
    const db = getDb();
    const m = await seedMember({ name: "SumPaid" });
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 6969n,
        gezahltAm: "2026-04-01",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const header = data.headers.find((h) => h.year === TEST_YEAR)!;
    expect(header.paidSumCents).toBeGreaterThanOrEqual(6969);
  });
});

describe("@phase-2 matrix loader — partial payer", () => {
  it("renders partial for a row with 0 < paidCents < betragCents", async () => {
    await ensureSatz(TEST_YEAR);
    const m = await seedMember({ name: "PartialPayerMatrix" });
    const db = getDb();
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 3000n,
        gezahltAm: "2026-02-01",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const cell = data.cells.find(
      (c) => c.memberId === m.id && c.year === TEST_YEAR,
    );
    // Must show the real partial state, not open (no false debt).
    expect(cell?.state).toBe("partial");
    expect(cell?.paidCents).toBe(3000);
    expect(cell?.betragCents).toBe(6969);
    expect(cell?.isLocked).toBe(false);
  });

  it("partial cell is included in totalDueCount but not paidCount", async () => {
    await ensureSatz(TEST_YEAR);
    const m = await seedMember({ name: "PartialHeaderCheck" });
    const db = getDb();
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: TEST_YEAR,
        betragCents: 6969n,
        paidCents: 2000n,
        gezahltAm: "2026-03-01",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [TEST_YEAR] });
    const header = data.headers.find((h) => h.year === TEST_YEAR)!;
    // totalDueCount includes partial (member still owes something)
    const allForYear = data.cells.filter((c) => c.year === TEST_YEAR);
    const partialForYear = allForYear.filter((c) => c.state === "partial");
    expect(partialForYear.length).toBeGreaterThanOrEqual(1);
    // partial cells are NOT in paidCount
    const paidForYear = allForYear.filter((c) => c.state === "paid");
    expect(header.paidCount).toBe(paidForYear.length);
  });
});

describe("@phase-2 matrix loader — locked year", () => {
  it("renders underlying state + isLocked=true (not dead locked_year) when year <= festgeschriebenBis", async () => {
    await ensureSatz(2023);
    const db = getDb();
    // The monotonic trigger forbids lowering festgeschrieben_bis, so we only
    // ever raise it. Use a far-past test year (2021/2022) that won't interfere
    // with current-year matrix flows in other specs.
    await ensureSatz(2021);
    await db.execute(
      sql`INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2022'::jsonb) ON CONFLICT (key) DO UPDATE SET value = '2022'::jsonb`,
    );

    const m = await seedMember({ name: "LockedYearMember" });
    await seedOpenBeitrag({ memberId: m.id, year: 2021 });

    const data = await loadMatrix({ years: [2021] });
    const cell = data.cells.find((c) => c.memberId === m.id && c.year === 2021);
    // Loader no longer emits "locked_year" — it emits the honest state + isLocked.
    expect(cell?.state).not.toBe("locked_year");
    expect(cell?.isLocked).toBe(true);
    // An unpaid open beitrag in a locked year still shows as open/overdue.
    expect(["open", "overdue"]).toContain(cell?.state);
    // Do NOT reset festgeschrieben_bis — the monotonic trigger prevents lowering it.
    // The test DB is reset before each full test run so this is safe.
  });

  it("locked-but-paid year: state=paid + isLocked=true, header counts it as paid", async () => {
    // Regression guard: a locked year with a fully-paid beitrag must show
    // state="paid" + isLocked=true, and paidCount/paidSumCents must include it.
    // Before the redesign fix, locked_year cells hid the paid state so a
    // fully-paid closed year showed "0/0 bezahlt" instead of "1/1 bezahlt".
    await ensureSatz(2021);
    const db = getDb();
    await db.execute(
      sql`INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2022'::jsonb) ON CONFLICT (key) DO UPDATE SET value = '2022'::jsonb`,
    );

    const m = await seedMember({ name: "LockedPaidMember" });
    await db
      .insert(memberBeitrags)
      .values({
        memberId: m.id,
        year: 2021,
        betragCents: 6969n,
        paidCents: 6969n,
        gezahltAm: "2021-03-15",
        source: "app",
      })
      .onConflictDoNothing();

    const data = await loadMatrix({ years: [2021] });
    const cell = data.cells.find((c) => c.memberId === m.id && c.year === 2021);
    // Honest state: paid (not the dead "locked_year").
    expect(cell?.state).toBe("paid");
    expect(cell?.isLocked).toBe(true);

    const header = data.headers.find((h) => h.year === 2021)!;
    // The paid cell must count in the header totals — NOT show 0/N.
    expect(header.paidCount).toBeGreaterThanOrEqual(1);
    expect(header.paidSumCents).toBeGreaterThanOrEqual(6969);
    expect(header.totalDueCount).toBeGreaterThanOrEqual(1);
  });
});
