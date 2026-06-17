/**
 * Open-Auslagen count — the Prüfung tab badge source (Aurora spec §5).
 *
 * Predicate is IDENTICAL to dashboard.ts loadDashboardKpis() query #1
 * (auslagen_submissions with no decision yet): decided_at IS NULL. The
 * layout load exposes this on every /app page so the mobile tab badge and
 * the dashboard task row can never disagree. Keep both predicates in sync —
 * tests/unit/aurora-inbox-count.test.ts pins this one to the DB truth.
 */
import { count, isNull } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";

export async function countOpenAuslagen(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: count() })
    .from(auslagenSubmissions)
    .where(isNull(auslagenSubmissions.decidedAt));
  return rows[0]?.value ?? 0;
}
