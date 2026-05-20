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
} from "$lib/server/domain/dashboard.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

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

  const [kpis, recentActivity, festgeschriebenBis] = await Promise.all([
    loadDashboardKpis(year),
    loadRecentActivity(),
    fetchFestgeschriebenBis(),
  ]);

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
  };
};
