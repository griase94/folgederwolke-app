// @vitest-environment node
/**
 * S2 — Beiträge book by Zufluss (§ 11 EStG), not by Beitragsjahr.
 *
 * The scenario every assertion here is built around is the one that was
 * verified broken against a real DB before S2: a member owes the 2025 Beitrag
 * and pays it on 2026-03-20. Pre-S2 that money landed in the EÜR **2025**
 * while carrying a 2026 Datum, the Mark-Paid-Popover promised „EÜR 2026", and
 * once 2025 was festgeschrieben the payment could not be recorded at all.
 *
 * These are behaviour assertions across every money surface rather than a grep
 * over the queries, because the failure mode is a *forgotten* consumer — a
 * grep can only catch the ones it knows to look for.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  markBeitragPaid,
  markBeitragUnpaid,
  FUTURE_PAYMENT_DATE_ERROR,
} from "$lib/server/domain/members-actions.js";
import {
  loadEurWorkspaceData,
  loadEurAggregatesForPdf,
} from "$lib/server/eur/load.js";
import { loadJahresabschlussHub } from "$lib/server/eur/hub.js";
import { loadDashboardKpis } from "$lib/server/domain/dashboard.js";
import { buchungsjahrOfGezahltAm } from "$lib/server/domain/beitrag-buchungsjahr.js";

/** Beitragsjahr under test; paid in the FOLLOWING calendar year. */
const BEITRAGSJAHR = 2025;
const ZUFLUSSJAHR = 2026;
const LATE_PAYMENT = "2026-03-20";

/**
 * Raise `settings.festgeschrieben_bis`.
 *
 * Only ever FORWARD: migration 0014 installs a trigger that refuses a DELETE
 * ("Festschreibung ist endgültig") and any non-monotonic UPDATE for the
 * `app_runtime` role the tests connect as. The seed starts at 2024, so the
 * Festschreibungs-block below is the last thing in this file and walks the
 * value up exactly once — that ordering is load-bearing, not incidental.
 */
async function raiseFestgeschriebenBisTo(value: number) {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${String(value)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = ${String(value)}::jsonb
  `);
}

/** Clear every Beitrag payment so each test starts from a known cash position. */
async function clearAllPayments() {
  const db = getDb();
  await db.execute(
    sql`UPDATE member_beitrags SET paid_cents = 0, gezahlt_am = NULL`,
  );
}

async function anyMemberWithBeitragRow(year: number): Promise<string> {
  const db = getDb();
  const [row] = (await db.execute(sql`
    SELECT member_id::text AS mid FROM member_beitrags WHERE year = ${year} LIMIT 1
  `)) as unknown as Array<{ mid: string }>;
  if (!row) throw new Error(`fixture gap: no member_beitrags row for ${year}`);
  return row.mid;
}

describe("S2 — Mitgliedsbeiträge book by Zufluss", () => {
  // Only the cash position is reset between tests; festgeschrieben_bis can
  // never be lowered (see raiseFestgeschriebenBisTo).
  beforeEach(clearAllPayments);

  it("buchungsjahrOfGezahltAm parses the payment year and fails closed", () => {
    expect(buchungsjahrOfGezahltAm("2026-03-20")).toBe(2026);
    expect(buchungsjahrOfGezahltAm("2025-12-31")).toBe(2025);
    expect(buchungsjahrOfGezahltAm("")).toBeNull();
    expect(buchungsjahrOfGezahltAm(null)).toBeNull();
    expect(buchungsjahrOfGezahltAm("20.03.2026")).toBeNull();
  });

  it("a Beitragsjahr-2025 payment made in 2026 lands in the EÜR 2026, not 2025", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    const before25 = await loadEurWorkspaceData(BEITRAGSJAHR);
    const before26 = await loadEurWorkspaceData(ZUFLUSSJAHR);

    const res = await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: LATE_PAYMENT,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(res.ok).toBe(true);

    const after25 = await loadEurWorkspaceData(BEITRAGSJAHR);
    const after26 = await loadEurWorkspaceData(ZUFLUSSJAHR);

    expect(after25.beitragEinnahmenCents).toBe(before25.beitragEinnahmenCents);
    expect(after26.beitragEinnahmenCents).toBeGreaterThan(
      before26.beitragEinnahmenCents,
    );
  });

  it("the EÜR row's Datum lies inside the year it is booked into", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: LATE_PAYMENT,
      actorUserId: null,
      actorRole: "admin",
    });

    // Pre-S2 this row sat in the 2025 book carrying a 2026 Datum.
    const agg25 = await loadEurAggregatesForPdf(BEITRAGSJAHR);
    expect(
      agg25.beitragEurRows.some((r) => r.relevanzDatum === LATE_PAYMENT),
    ).toBe(false);

    const agg26 = await loadEurAggregatesForPdf(ZUFLUSSJAHR);
    const row = agg26.beitragEurRows.find(
      (r) => r.relevanzDatum === LATE_PAYMENT,
    );
    expect(row).toBeDefined();
    expect(row!.relevanzDatum!.startsWith(String(ZUFLUSSJAHR))).toBe(true);
    // The label still names the Beitragsjahr it settles — both facts survive.
    expect(row!.bezeichnung).toContain(String(BEITRAGSJAHR));
  });

  it("Dashboard, Hub and EÜR agree on the same Zufluss year", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    const kpisBefore = await loadDashboardKpis();

    await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: LATE_PAYMENT,
      actorUserId: null,
      actorRole: "admin",
    });

    // Hub card and EÜR are the same number for the same year — the Hub was one
    // of the surfaces that keyed on Beitragsjahr before S2.
    const eur26 = await loadEurWorkspaceData(ZUFLUSSJAHR);
    const hub = await loadJahresabschlussHub();
    const card26 = hub.years.find((y) => y.year === ZUFLUSSJAHR);
    expect(card26).toBeDefined();
    expect(card26!.einnahmenCents).toBe(eur26.eur.totalEinnahmenCents);

    // The dashboard always reads the CURRENT Buchungsjahr, so the payment moves
    // its Einnahmen exactly when that year IS the Zufluss year.
    const kpisAfter = await loadDashboardKpis();
    const delta =
      kpisAfter.cashflow.einnahmenYtdCents -
      kpisBefore.cashflow.einnahmenYtdCents;
    if (kpisAfter.cashflow.year === ZUFLUSSJAHR) {
      expect(delta).toBeGreaterThan(0);
      expect(
        kpisAfter.cashflow.einnahmenBySphereCents.ideeller,
      ).toBeGreaterThan(kpisBefore.cashflow.einnahmenBySphereCents.ideeller);
    } else {
      expect(delta).toBe(0);
    }
  });

  it("the monthly series buckets the late payment into its payment month", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: LATE_PAYMENT,
      actorUserId: null,
      actorRole: "admin",
    });
    // März = index 2. Pre-S2 the row was filtered into 2025 but bucketed by a
    // 2026 month — a phantom spike in the wrong year's trend.
    const eur26 = await loadEurWorkspaceData(ZUFLUSSJAHR);
    expect(eur26.monthlyOverschuss[2]).toBeGreaterThan(0);
    const eur25 = await loadEurWorkspaceData(BEITRAGSJAHR);
    expect(eur25.beitragEinnahmenCents).toBe(0);
  });

  it("rejects a payment date in a future year", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    const res = await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: "2099-01-02",
      actorUserId: null,
      actorRole: "admin",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(422);
      expect(res.error).toBe(FUTURE_PAYMENT_DATE_ERROR);
    }
  });

  it("rejects an unparseable payment date instead of booking into NaN", async () => {
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    const res = await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: "20.03.2026",
      actorUserId: null,
      actorRole: "admin",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("Beitragsjahr stays the Soll-Zuordnung (matrix/Mahnwesen untouched)", async () => {
    const db = getDb();
    const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
    await markBeitragPaid({
      memberId,
      year: BEITRAGSJAHR,
      gezahltAm: LATE_PAYMENT,
      actorUserId: null,
      actorRole: "admin",
    });
    // The row still belongs to the 2025 Soll — that is what the matrix reads.
    const [row] = (await db.execute(sql`
      SELECT year, paid_cents::bigint AS pc, gezahlt_am::text AS g
        FROM member_beitrags
       WHERE member_id = ${memberId}::uuid AND year = ${BEITRAGSJAHR}
    `)) as unknown as Array<{ year: number; pc: bigint; g: string }>;
    expect(row).toBeDefined();
    expect(row!.year).toBe(BEITRAGSJAHR);
    expect(Number(row!.pc)).toBeGreaterThan(0);
    expect(row!.g).toBe(LATE_PAYMENT);
  });

  /**
   * LAST block in the file, and internally ordered, because festgeschrieben_bis
   * can only move forward (migration 0014). The seed sits at 2024; the first
   * test here books a payment INTO 2025 while it is still open and only then
   * closes 2025, which is the state the remaining three assert against.
   */
  describe("Festschreibung follows the money", () => {
    it("rejects the storno of a payment booked INTO the year being closed", async () => {
      const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
      // 2025 still open (seed: 2024) — this payment books into 2025.
      const paid = await markBeitragPaid({
        memberId,
        year: BEITRAGSJAHR,
        gezahltAm: `${BEITRAGSJAHR}-06-01`,
        actorUserId: null,
        actorRole: "admin",
      });
      expect(paid.ok).toBe(true);

      await raiseFestgeschriebenBisTo(BEITRAGSJAHR);

      const res = await markBeitragUnpaid({
        memberId,
        year: BEITRAGSJAHR,
        actorUserId: null,
        actorRole: "admin",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(409);
    });

    it("refuses to move money OUT of a closed year by re-marking it", async () => {
      // The gate has to hold on both sides of the write. Checking only the
      // TARGET year let a payment already booked into a closed year be
      // re-marked with a date in an open one: the sealed year silently lost the
      // amount — no Storno, no 409, no audit trace, and member_beitrags has no
      // trigger backstop. The pre-S2 gate blocked every write to a closed
      // Beitragsjahr and covered this by accident.
      const db = getDb();
      const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);

      // Construct the pre-state directly: a payment recorded while 2025 was
      // still open. It cannot be created through the action any more (the
      // target-year gate now rejects it), which is the point.
      await db.execute(sql`
        UPDATE member_beitrags
           SET paid_cents = betrag_cents, gezahlt_am = ${`${BEITRAGSJAHR}-06-01`}
         WHERE member_id = ${memberId}::uuid AND year = ${BEITRAGSJAHR}
      `);
      const before = await loadEurWorkspaceData(BEITRAGSJAHR);
      expect(before.beitragEinnahmenCents).toBeGreaterThan(0);

      const res = await markBeitragPaid({
        memberId,
        year: BEITRAGSJAHR,
        gezahltAm: LATE_PAYMENT, // 2026 — an open year
        actorUserId: null,
        actorRole: "admin",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(409);

      // The closed year still holds every cent, and nothing leaked into 2026.
      const after = await loadEurWorkspaceData(BEITRAGSJAHR);
      expect(after.beitragEinnahmenCents).toBe(before.beitragEinnahmenCents);
      const open = await loadEurWorkspaceData(ZUFLUSSJAHR);
      expect(open.beitragEinnahmenCents).toBe(0);
    });

    it("records a late payment for a CLOSED Beitragsjahr (the B2b trap)", async () => {
      const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);

      const res = await markBeitragPaid({
        memberId,
        year: BEITRAGSJAHR,
        gezahltAm: LATE_PAYMENT,
        actorUserId: null,
        actorRole: "admin",
      });

      // Pre-S2 this returned 409 on money that had genuinely arrived, leaving
      // the Kassenwart no way to record it at all.
      expect(res.ok).toBe(true);
      const eur26 = await loadEurWorkspaceData(ZUFLUSSJAHR);
      expect(eur26.beitragEinnahmenCents).toBeGreaterThan(0);
    });

    it("still rejects a payment DATED inside the closed year", async () => {
      const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);

      const res = await markBeitragPaid({
        memberId,
        year: BEITRAGSJAHR,
        gezahltAm: `${BEITRAGSJAHR}-06-01`,
        actorUserId: null,
        actorRole: "admin",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(409);
    });

    it("allows the storno of a payment booked into an OPEN year", async () => {
      const memberId = await anyMemberWithBeitragRow(BEITRAGSJAHR);
      const paid = await markBeitragPaid({
        memberId,
        year: BEITRAGSJAHR,
        gezahltAm: LATE_PAYMENT,
        actorUserId: null,
        actorRole: "admin",
      });
      expect(paid.ok).toBe(true);

      // The Beitragsjahr is closed, but the booking lives in an open 2026.
      const res = await markBeitragUnpaid({
        memberId,
        year: BEITRAGSJAHR,
        actorUserId: null,
        actorRole: "admin",
      });
      expect(res.ok).toBe(true);
    });
  });
});
