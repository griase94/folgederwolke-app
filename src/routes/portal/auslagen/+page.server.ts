/**
 * /portal/auslagen — the member's full Auslagen list (A-flow S2b).
 *
 * The home shows the same rows; this route exists so "Meine Auslagen" is a
 * place you can link to and come back to. Same scope rule, same derived status
 * — it reuses the home loader's query shape rather than inventing a second
 * projection of the same table.
 */

import { redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { deriveStatus } from "$lib/server/domain/auslage-status.js";

export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.session?.user.memberId;
  if (!memberId) redirect(303, "/app");

  const db = getDb();
  const rows = await db
    .select({
      businessId: auslagenSubmissions.businessId,
      bezeichnung: auslagenSubmissions.bezeichnung,
      betragCents: auslagenSubmissions.betragCents,
      rechnungsdatum: auslagenSubmissions.rechnungsdatum,
      decision: auslagenSubmissions.decision,
      decidedAt: auslagenSubmissions.decidedAt,
      reviewedAt: auslagenSubmissions.reviewedAt,
      erstattetAm: expenses.erstattetAm,
    })
    .from(auslagenSubmissions)
    .leftJoin(expenses, eq(expenses.id, auslagenSubmissions.approvedExpenseId))
    .where(eq(auslagenSubmissions.bezahltVonMemberId, memberId))
    .orderBy(desc(auslagenSubmissions.submittedAt));

  return {
    auslagen: rows.map((r) => ({
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      rechnungsdatum: r.rechnungsdatum,
      status: deriveStatus({
        decision: r.decision,
        decidedAt: r.decidedAt,
        reviewedAt: r.reviewedAt,
        erstattetAm: r.erstattetAm,
      }),
    })),
  };
};
