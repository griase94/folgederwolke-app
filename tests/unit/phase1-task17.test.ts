/**
 * Task 1.7: reminder skips per-year is_exempt rows + dashboard paidCount/
 * paidSumCents/totalDueCount/exemptCount KPIs.
 *
 * TDD: tests written first, implementation follows.
 *
 * @phase-1
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { memberBeitrags } from "$lib/server/db/schema/members.js";
import { and, eq } from "drizzle-orm";
import {
  seedMember,
  seedOpenBeitrag,
  seedPaidBeitrag,
} from "../helpers/db-seed.js";
import { loadDashboardKpis } from "$lib/server/domain/dashboard.js";
import { dispatchBeitragsreminder } from "$lib/server/domain/cron-tasks.js";

const TEST_YEAR = 2026;

const REMINDER_OPTS = {
  iban: "DE43830654089999999999",
  bic: "BELADEBEXXX",
  bank: "Berliner Volksbank",
  empfaenger: "Folge der Wolke e.V.",
  year: TEST_YEAR,
};

// ---------------------------------------------------------------------------
// Task 1.7 — reminder per-year is_exempt filter
// ---------------------------------------------------------------------------

describe("@phase-1 dispatchBeitragsreminder — per-year isExempt filter (Task 1.7)", () => {
  it("skips member whose per-year memberBeitrags.isExempt=true", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({
      name: "Phase1ExemptReminderTest",
      email: "phase1exempt@test.local",
    });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR });

    // Mark the per-year row as exempt
    await db
      .update(memberBeitrags)
      .set({ isExempt: true, exemptReason: "Härtefall" })
      .where(
        and(
          eq(memberBeitrags.memberId, m.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );

    const result = await dispatchBeitragsreminder(REMINDER_OPTS);

    // The member exists with an open (unpaid) row, but is_exempt=true on the
    // per-year row must exclude them. Their row must not contribute to `sent`.
    // We can't assert sent=0 absolutely (other members may exist), but we can
    // assert `checked` does not include this member by checking sent_mails.
    const { sentMails } = await import("$lib/server/db/schema/mails.js");
    const mails = await db
      .select()
      .from(sentMails)
      .where(
        and(
          eq(sentMails.entityId, m.id),
          eq(sentMails.template, "beitrag_reminder"),
        ),
      );

    expect(mails).toHaveLength(0);
    void result; // result checked via DB assertion above
  });
});

// ---------------------------------------------------------------------------
// Task 1.7 — dashboard paidCount / paidSumCents / totalDueCount / exemptCount
// ---------------------------------------------------------------------------

describe("@phase-1 dashboard beitrag KPIs (Task 1.7)", () => {
  it("paidCount reflects paid beitrag rows for the year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // Seed one paid member
    const paid = await seedMember({ name: "DashPaidMember1" });
    await seedPaidBeitrag({ memberId: paid.id, year: TEST_YEAR });

    const kpis = await loadDashboardKpis(TEST_YEAR);

    expect(typeof kpis.beitragPaidCount).toBe("number");
    expect(kpis.beitragPaidCount).toBeGreaterThanOrEqual(1);
  });

  it("paidSumCents reflects sum of paidCents for paid rows", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const paid = await seedMember({ name: "DashPaidMember2" });
    await seedPaidBeitrag({ memberId: paid.id, year: TEST_YEAR });

    const kpis = await loadDashboardKpis(TEST_YEAR);

    expect(typeof kpis.beitragPaidSumCents).toBe("bigint");
    expect(kpis.beitragPaidSumCents).toBeGreaterThan(0n);
  });

  it("totalDueCount reflects all non-exempt beitrag rows for the year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "DashTotalDueMember" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR });

    const kpis = await loadDashboardKpis(TEST_YEAR);

    expect(typeof kpis.beitragTotalDueCount).toBe("number");
    expect(kpis.beitragTotalDueCount).toBeGreaterThanOrEqual(1);
  });

  it("exemptCount reflects per-year is_exempt rows", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const exempt = await seedMember({ name: "DashExemptMember" });
    await seedOpenBeitrag({ memberId: exempt.id, year: TEST_YEAR });

    // Mark as per-year exempt
    await db
      .update(memberBeitrags)
      .set({ isExempt: true, exemptReason: "Ehrenmitglied" })
      .where(
        and(
          eq(memberBeitrags.memberId, exempt.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );

    const kpis = await loadDashboardKpis(TEST_YEAR);

    expect(typeof kpis.beitragExemptCount).toBe("number");
    expect(kpis.beitragExemptCount).toBeGreaterThanOrEqual(1);
  });

  it("globally-exempt member (members.beitrag_exempt=true) is excluded from beitragTotalDueCount and beitragPaidCount", async () => {
    // P1-1 regression: before the fix, queries 20 + 21 only checked
    // member_beitrags.is_exempt — a globally-exempt Ehrenmitglied with a
    // materialized row (is_exempt=false, paidCents=0) would be counted in
    // beitragTotalDueCount (denominator) but never pay, wrongly dragging
    // down the paid-ratio.
    //
    // Strategy: take kpisBefore snapshot FIRST, then seed both
    //   (a) a globally-exempt Ehrenmitglied with an open row (is_exempt=false), and
    //   (b) one regular paid member.
    // Expected deltas: totalDueCount +1 (only regular), paidCount +1 (only regular).
    // Buggy behaviour: totalDueCount +2 (global-exempt counted in denominator).
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // Snapshot BEFORE seeding either member.
    const kpisBefore = await loadDashboardKpis(TEST_YEAR);

    // Seed a globally-exempt Ehrenmitglied + their materialized row (is_exempt=false).
    const ehrenmitglied = await seedMember({
      name: "GlobalExemptDashTest",
      beitragExempt: true,
      beitragExemptReason: "Ehrenmitgliedschaft seit 2010",
    });
    await seedOpenBeitrag({ memberId: ehrenmitglied.id, year: TEST_YEAR });

    // Seed one regular non-exempt paid member.
    const regularPaid = await seedMember({ name: "GlobalExemptDashRegular" });
    await seedPaidBeitrag({ memberId: regularPaid.id, year: TEST_YEAR });

    const kpisAfter = await loadDashboardKpis(TEST_YEAR);

    // totalDueCount must go up by exactly 1 (only the regular member).
    // If the buggy query counts ehrenmitglied, delta would be +2.
    expect(
      kpisAfter.beitragTotalDueCount - kpisBefore.beitragTotalDueCount,
    ).toBe(1);

    // paidCount must go up by exactly 1 (only the regular member paid).
    expect(kpisAfter.beitragPaidCount - kpisBefore.beitragPaidCount).toBe(1);
  });

  it("openBeitragsCount excludes per-year is_exempt rows", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const exempt = await seedMember({ name: "DashExemptNotOpenMember" });
    await seedOpenBeitrag({ memberId: exempt.id, year: TEST_YEAR });

    // Count open before marking exempt
    const kpisBefore = await loadDashboardKpis(TEST_YEAR);

    await db
      .update(memberBeitrags)
      .set({ isExempt: true, exemptReason: "Befreiungs-Test" })
      .where(
        and(
          eq(memberBeitrags.memberId, exempt.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );

    const kpisAfter = await loadDashboardKpis(TEST_YEAR);

    // After marking exempt, openBeitragsCount must not include this member
    expect(kpisAfter.openBeitragsCount).toBeLessThan(
      kpisBefore.openBeitragsCount,
    );
    expect(kpisAfter.openBeitragsMembers).toBeLessThan(
      kpisBefore.openBeitragsMembers,
    );
  });
});
