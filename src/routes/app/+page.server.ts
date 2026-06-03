/**
 * Dashboard load — real queries for Phase 6 treasurer interface.
 *
 * Returns live KPIs:
 *   openAuslagenCount        — pending inbox submissions
 *   approvedNotErstattetCount/SumCents — approved expenses awaiting SEPA
 *   openBeitragsCount/Members — member beitrags unpaid this year
 *   spendenYtdCents          — donations YTD
 *   activeMemberCount        — members without austrittsDatum
 *   recentActivity           — last 10 audit_log entries
 *
 * C3 (2026-05-20) extensions:
 *   cashflow                 — 2-card headline + 4-chip block (year-scoped)
 *   The ?year=NNNN URL param scopes the cashflow + WGB to a fiscal year
 *   (C2 year-switcher contract).
 */

import type { PageServerLoad } from "./$types.js";
import {
  loadDashboardKpis,
  loadRecentActivity,
  topActiveProjects,
} from "$lib/server/domain/dashboard.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { berlinYear } from "$lib/domain/year.js";

/**
 * Read `settings.festgeschrieben_bis` for the C3-4 year-lock badge.
 * Returns the year as a number, or `null` when not set / unparseable.
 * Kept local to the dashboard load so we don't introduce a cross-domain
 * dependency just for this one read.
 */
async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const load: PageServerLoad = async ({ url }) => {
  const yearParam = url.searchParams.get("year");
  const yearArg = yearParam ? parseInt(yearParam, 10) : undefined;
  const year = Number.isFinite(yearArg) ? yearArg : undefined;

  const [kpis, recentActivity, festgeschriebenBis, topProjekte] =
    await Promise.all([
      loadDashboardKpis(year),
      loadRecentActivity(),
      fetchFestgeschriebenBis(),
      topActiveProjects(5),
    ]);

  // C4-DASH-lite: load Beiträge totals for the dashboard widget (O-3/M-1).
  // We inline the aggregation here; once C5-MEM-lite's `memberBeitragsTotals`
  // helper lands, the post-Wave-1 integration test compares numbers and a
  // follow-up swaps this block for the shared helper.
  const beitragsYear = berlinYear();
  const beitragsRows = await getDb().execute<{
    member_count: string;
    paid_count: string;
    paid_cents: string;
    open_count: string;
    open_cents: string;
    overdue_count: string;
    last_payment: string | null;
    prior_years_unpaid: string;
  }>(sql`
    WITH grace AS (
      SELECT COALESCE(NULLIF(value #>> '{}', 'null')::int, 60) AS days
      FROM settings WHERE key = 'beitrag.overdue_grace_days'
    )
    SELECT
      (SELECT COUNT(*) FROM members WHERE austritts_datum IS NULL)::text                  AS member_count,
      COUNT(DISTINCT CASE WHEN mb.paid_cents >= mb.betrag_cents THEN mb.member_id END)::text AS paid_count,
      COALESCE(SUM(mb.paid_cents), 0)::text                                               AS paid_cents,
      COUNT(DISTINCT CASE WHEN mb.paid_cents <  mb.betrag_cents THEN mb.member_id END)::text AS open_count,
      COALESCE(SUM(GREATEST(mb.betrag_cents - mb.paid_cents, 0)), 0)::text                AS open_cents,
      COUNT(DISTINCT CASE
        WHEN mb.paid_cents < mb.betrag_cents AND mb.is_exempt = false
         AND current_date > (COALESCE(bs.faelligkeit_at, (${beitragsYear}::text || '-03-31')::date)
              + (COALESCE((SELECT days FROM grace), 60) || ' days')::interval)
        THEN mb.member_id END)::text                                                      AS overdue_count,
      (SELECT MAX(gezahlt_am)::text FROM member_beitrags WHERE year = ${beitragsYear})    AS last_payment,
      (SELECT COUNT(DISTINCT year) FROM member_beitrags
        WHERE year < ${beitragsYear} AND paid_cents < betrag_cents AND is_exempt = false)::text AS prior_years_unpaid
    FROM member_beitrags mb
    LEFT JOIN beitragssatz_by_year bs ON bs.year = mb.year
    WHERE mb.year = ${beitragsYear}
  `);
  const br = (
    beitragsRows as unknown as Array<{
      member_count: string;
      paid_count: string;
      paid_cents: string;
      open_count: string;
      open_cents: string;
      overdue_count: string;
      last_payment: string | null;
      prior_years_unpaid: string;
    }>
  )[0] ?? {
    member_count: "0",
    paid_count: "0",
    paid_cents: "0",
    open_count: "0",
    open_cents: "0",
    overdue_count: "0",
    last_payment: null,
    prior_years_unpaid: "0",
  };
  const beitragsuebersicht = {
    year: beitragsYear,
    memberCount: Number(br.member_count),
    paidMemberCount: Number(br.paid_count),
    paidCents: Number(br.paid_cents),
    openMemberCount: Number(br.open_count),
    offenCents: Number(br.open_cents),
    overdueCount: Number(br.overdue_count),
    lastPaymentDate: br.last_payment,
    priorYearsUnpaidCount: Number(br.prior_years_unpaid),
  };

  return {
    ...kpis,
    // Serialize BigInt → number for SvelteKit's JSON serializer.
    // Values never exceed Number.MAX_SAFE_INTEGER (≈ 900 trillion cents).
    approvedNotErstattetSumCents: Number(kpis.approvedNotErstattetSumCents),
    spendenYtdCents: Number(kpis.spendenYtdCents),
    recentActivity,
    // wgb is already number-safe (no BigInt fields).
    wgb: kpis.wgb,
    // C3 cashflow block — all values are plain numbers (no BigInt).
    cashflow: kpis.cashflow,
    // C3-4 (cycle 2): year-lock signal for the cashflow header badge.
    festgeschriebenBis,
    // C4-DASH-lite: BeitragsuebersichtWidget data.
    beitragsuebersicht,
    // C1-PRJ-B/C: top 5 active projects by |saldo| for the dashboard widget.
    topProjekte,
  };
};
