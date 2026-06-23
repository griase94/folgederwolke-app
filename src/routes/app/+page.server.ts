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
 *
 * PR1 latency optimisations:
 *   - beitragsRows moved INTO the Promise.all fan-out (was serial tail).
 *   - festgeschriebenBis read removed — taken from layout data via parent()
 *     to avoid duplicating the settings read already done in +layout.server.ts.
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

export const load: PageServerLoad = async ({ url, parent }) => {
  const yearParam = url.searchParams.get("year");
  const yearArg = yearParam ? parseInt(yearParam, 10) : undefined;
  const year = Number.isFinite(yearArg) ? yearArg : undefined;

  // PR1: beitragsRows moved inside the fan-out so all four queries run in
  // parallel (was: awaited after the Promise.all — a serial tail round-trip).
  const beitragsYear = berlinYear();
  // F9/F34/F38: numerator and denominator MUST be computed over ONE member
  // population for the year, or the "X/Y bezahlt" headline can read an
  // impossible "6/5" and the progress bar overflows. Old query mixed
  // populations: member_count counted active members (no per-year join),
  // paid_count counted DISTINCT member_id over member_beitrags rows with NO
  // member join (so a paid-then-left member inflated the numerator), and
  // open/overdue applied inconsistent exempt/exited filters → phantom debt.
  //
  // New shape: a `liable` CTE of members liable in beitragsYear (joined this
  // year, not yet exited as of this year), LEFT JOIN their per-year row.
  // Exempt = member-level beitrag_exempt OR per-year is_exempt. Every count is
  // taken over THIS set so the numerator can never exceed the denominator and
  // exempt/exited members never create phantom "offen" debt. Mirrors the
  // canonical openBeitragsAgg in dashboard.ts and the matrix loader.
  const beitragsQuery = getDb().execute<{
    member_count: string;
    paid_count: string;
    paid_cents: string;
    open_count: string;
    open_cents: string;
    overdue_count: string;
    exempt_count: string;
    last_payment: string | null;
    prior_years_unpaid: string;
  }>(sql`
    WITH grace AS (
      SELECT COALESCE(NULLIF(value #>> '{}', 'null')::int, 60) AS days
      FROM settings WHERE key = 'beitrag.overdue_grace_days'
    ),
    liable AS (
      SELECT
        m.id                                                          AS member_id,
        (m.beitrag_exempt OR COALESCE(mb.is_exempt, false))           AS is_exempt,
        mb.betrag_cents                                               AS betrag_cents,
        mb.paid_cents                                                 AS paid_cents,
        mb.gezahlt_am                                                 AS gezahlt_am,
        bs.faelligkeit_at                                             AS faelligkeit_at
      FROM members m
      LEFT JOIN member_beitrags mb
        ON mb.member_id = m.id AND mb.year = ${beitragsYear}
      LEFT JOIN beitragssatz_by_year bs ON bs.year = ${beitragsYear}
      WHERE
        -- joined on or before this Buchungsjahr (NULL eintritt = always liable)
        (m.eintritts_datum IS NULL
           OR EXTRACT(YEAR FROM m.eintritts_datum) <= ${beitragsYear})
        -- not yet exited as of this Buchungsjahr
        AND (m.austritts_datum IS NULL
           OR EXTRACT(YEAR FROM m.austritts_datum) >= ${beitragsYear})
    )
    SELECT
      -- All liable members for the year (incl. exempt). LageCard derives its
      -- denominator as member_count - exempt_count, so this stays the full
      -- liable population; paid/open below are non-exempt-only.
      COUNT(*)::text                                                                       AS member_count,
      -- Numerator: of the non-exempt liable, the ones whose obligation is fully covered.
      COUNT(*) FILTER (
        WHERE NOT is_exempt AND betrag_cents IS NOT NULL AND paid_cents >= betrag_cents
      )::text                                                                             AS paid_count,
      COALESCE(SUM(paid_cents) FILTER (WHERE NOT is_exempt), 0)::text                     AS paid_cents,
      -- Open: liable, non-exempt, with an obligation not yet covered.
      COUNT(*) FILTER (
        WHERE NOT is_exempt AND betrag_cents IS NOT NULL AND paid_cents < betrag_cents
      )::text                                                                             AS open_count,
      COALESCE(
        SUM(GREATEST(betrag_cents - paid_cents, 0)) FILTER (WHERE NOT is_exempt),
        0
      )::text                                                                             AS open_cents,
      COUNT(*) FILTER (
        WHERE NOT is_exempt AND betrag_cents IS NOT NULL AND paid_cents < betrag_cents
          AND current_date > (COALESCE(faelligkeit_at, (${beitragsYear}::text || '-03-31')::date)
               + (COALESCE((SELECT days FROM grace), 60) || ' days')::interval)
      )::text                                                                             AS overdue_count,
      COUNT(*) FILTER (WHERE is_exempt)::text                                             AS exempt_count,
      (SELECT MAX(gezahlt_am)::text FROM member_beitrags WHERE year = ${beitragsYear})    AS last_payment,
      (SELECT COUNT(DISTINCT mby.year) FROM member_beitrags mby
         JOIN members m2 ON m2.id = mby.member_id
        WHERE mby.year < ${beitragsYear}
          AND mby.paid_cents < mby.betrag_cents
          AND mby.is_exempt = false
          AND m2.beitrag_exempt = false
          AND (m2.austritts_datum IS NULL
               OR EXTRACT(YEAR FROM m2.austritts_datum) >= mby.year))::text               AS prior_years_unpaid
    FROM liable
  `);

  // PR1: festgeschriebenBis is already read by +layout.server.ts for every
  // /app/* request — pull it from parent() instead of issuing a duplicate
  // settings read. The parent() call resolves from already-computed layout
  // data and does NOT cause an additional round-trip.
  const [kpis, recentActivity, topProjekte, beitragsRows, layoutData] =
    await Promise.all([
      loadDashboardKpis(year),
      loadRecentActivity(30),
      topActiveProjects(5),
      beitragsQuery,
      parent(),
    ]);
  const br = (
    beitragsRows as unknown as Array<{
      member_count: string;
      paid_count: string;
      paid_cents: string;
      open_count: string;
      open_cents: string;
      overdue_count: string;
      exempt_count: string;
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
    exempt_count: "0",
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
    exemptMemberCount: Number(br.exempt_count),
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
    // PR1: taken from layout data (no extra round-trip).
    festgeschriebenBis: layoutData.festgeschriebenBis,
    // C4-DASH-lite: BeitragsuebersichtWidget data.
    beitragsuebersicht,
    // C1-PRJ-B/C: top 5 active projects by |saldo| for the dashboard widget.
    topProjekte,
  };
};
