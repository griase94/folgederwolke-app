/**
 * Spenden KPI aggregation — powers the Spenden list header (spec §9.1):
 * total + count + a disappearing "N ohne Bescheinigung" pill + "M
 * Bescheinigungen versandt".
 *
 * Read-only Drizzle query, mirroring the dashboard / Ausgaben-KPI aggregation
 * idiom (loadDashboardKpis, listAusgabenKpi). Money is integer cents (ADR-0003);
 * bigint sums are converted to Number for the caller.
 *
 * NO Sammelbestätigungs-Fenster / deadline: §9.1 deliberately drops it — there
 * is no statutory cutoff for issuing Zuwendungsbestätigungen, so surfacing a
 * fake deadline would be a false signal. This module computes NO window/date.
 *
 * C3-owned (Phase 6): aggregation lives here, NOT in the shared transactions.ts.
 */

import { count, eq, sql, sum } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";

export interface SpendenKpi {
  /** Sum of betragCents across all donations in scope. */
  totalCents: number;
  /** Count of all donations in scope. */
  count: number;
  /** Count of donations WITHOUT a Bescheinigungs-Nr (bescheinigung_nr IS NULL). */
  ohneBescheinigungCount: number;
  /** Count of donations WITH a Bescheinigungs-Nr (versandt). */
  versandtCount: number;
}

/**
 * Aggregate Spenden KPIs for the Spenden tab header.
 *
 * @param year  YearScope. A concrete year filters on `yearOfBuchung`;
 *              `ALL_YEARS` omits the year predicate (aggregate across all years).
 *
 * One grouped query over `donations`: sum(betragCents) + count(*) +
 * count(*) FILTER (WHERE bescheinigung_nr IS NULL) for the "ohne Bescheinigung"
 * pill, and the complementary NOT NULL filter for "versandt". The two filtered
 * counts partition the total count (every row's bescheinigung_nr is NULL XOR
 * NOT NULL).
 */
export async function listSpendenKpi(year: YearScope): Promise<SpendenKpi> {
  const db = getDb();

  // ALL_YEARS → no year predicate; concrete year → filter yearOfBuchung.
  const yearPredicate =
    year === ALL_YEARS ? undefined : eq(donations.yearOfBuchung, year);

  const [agg] = await db
    .select({
      sumCents: sum(donations.betragCents),
      cnt: count(),
      ohneBescheinigungCount: sql<number>`count(*) FILTER (WHERE ${donations.bescheinigungNr} IS NULL)::int`,
      versandtCount: sql<number>`count(*) FILTER (WHERE ${donations.bescheinigungNr} IS NOT NULL)::int`,
    })
    .from(donations)
    .where(yearPredicate);

  return {
    totalCents: Number(agg?.sumCents ?? 0),
    count: agg?.cnt ?? 0,
    ohneBescheinigungCount: agg?.ohneBescheinigungCount ?? 0,
    versandtCount: agg?.versandtCount ?? 0,
  };
}
