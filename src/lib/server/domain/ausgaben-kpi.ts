/**
 * Ausgaben KPI aggregation — powers the Ausgaben list header pill
 * "N offen · älteste X Tage" (spec §7.1, Phase 4 Task 1).
 *
 * Read-only Drizzle query, mirroring the dashboard aggregation idiom
 * (loadDashboardKpis in dashboard.ts). Money is integer cents (ADR-0003);
 * bigint sums are converted to Number for the caller.
 */

import { and, count, eq, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";

export interface AusgabenKpi {
  /** Sum of betragCents across all expenses in scope. */
  totalCents: number;
  /** Count of all expenses in scope. */
  count: number;
  /** Count of erstattete expenses (erstattetAm IS NOT NULL) — KPI status tile. */
  erstattetCount: number;
  /** Count of OPEN expenses (approved, not erstattet, not rejected). */
  offenCount: number;
  /**
   * Age in whole days (Europe/Berlin) of the OLDEST open expense, measured
   * from its `approvedAt` timestamp. `null` when there are no open rows.
   */
  oldestOpenAgeDays: number | null;
}

/**
 * Aggregate Ausgaben KPIs for the Ausgaben tab header.
 *
 * @param year  YearScope. A concrete year filters on `yearOfBuchung`;
 *              `ALL_YEARS` omits the year predicate (aggregate across all
 *              years).
 *
 * Aging basis is `approvedAt` (NOT createdAt / gebuchtAm): the pill answers
 * "how long has the oldest approved-but-unpaid Auslage been waiting for its
 * Erstattung?" — the wait clock starts at approval, not at booking. The
 * age is computed in SQL as whole calendar days between the Berlin-local
 * date of `min(approvedAt)` and today, matching the dashboard's Berlin-TZ
 * aggregation idiom.
 */
export async function listAusgabenKpi(year: YearScope): Promise<AusgabenKpi> {
  const db = getDb();

  // ALL_YEARS → no year predicate; concrete year → filter yearOfBuchung.
  const yearPredicate =
    year === ALL_YEARS ? undefined : eq(expenses.yearOfBuchung, year);

  // OPEN = approved, awaiting Erstattung, not rejected.
  const offenPredicate = and(
    isNotNull(expenses.approvedAt),
    isNull(expenses.erstattetAm),
    isNull(expenses.rejectedAt),
  );

  const [totalAgg, offenAgg] = await Promise.all([
    // 1. total + count over all expenses in scope.
    db
      .select({
        sumCents: sum(expenses.betragCents),
        cnt: count(),
        erstattetCount: sql<number>`count(*) FILTER (WHERE ${expenses.erstattetAm} IS NOT NULL)::int`,
      })
      .from(expenses)
      .where(yearPredicate),

    // 2. offen count + oldest-open age (whole Berlin-local days from the
    //    earliest approvedAt among open rows to today). Subtracting two
    //    Postgres `date`s yields an integer day count directly; NULL when
    //    there are no open rows (MIN over an empty set → NULL).
    db
      .select({
        offenCount: count(),
        oldestOpenAgeDays: sql<number | null>`(
          (now() AT TIME ZONE 'Europe/Berlin')::date
          - (MIN(${expenses.approvedAt}) AT TIME ZONE 'Europe/Berlin')::date
        )`,
      })
      .from(expenses)
      .where(
        yearPredicate ? and(yearPredicate, offenPredicate) : offenPredicate,
      ),
  ]);

  const oldestRaw = offenAgg[0]?.oldestOpenAgeDays;

  return {
    totalCents: Number(totalAgg[0]?.sumCents ?? 0),
    count: totalAgg[0]?.cnt ?? 0,
    erstattetCount: totalAgg[0]?.erstattetCount ?? 0,
    offenCount: offenAgg[0]?.offenCount ?? 0,
    oldestOpenAgeDays:
      oldestRaw === null || oldestRaw === undefined ? null : Number(oldestRaw),
  };
}
