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
 */

import type { PageServerLoad } from "./$types.js";
import {
  loadDashboardKpis,
  loadRecentActivity,
} from "$lib/server/domain/dashboard.js";

export const load: PageServerLoad = async () => {
  const [kpis, recentActivity] = await Promise.all([
    loadDashboardKpis(),
    loadRecentActivity(),
  ]);

  return {
    ...kpis,
    // Serialize BigInt → number for SvelteKit's JSON serializer.
    // Values never exceed Number.MAX_SAFE_INTEGER (≈ 900 trillion cents).
    approvedNotErstattetSumCents: Number(kpis.approvedNotErstattetSumCents),
    spendenYtdCents: Number(kpis.spendenYtdCents),
    recentActivity,
  };
};
