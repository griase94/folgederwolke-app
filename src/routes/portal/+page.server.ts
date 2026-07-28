/**
 * Portal home — greeting + the member's OWN Auslagen (Aurora A-flow S2a).
 *
 * SECURITY: the list is scoped to `bezahlt_von_member_id = session member`.
 * The member_id comes from the resolved session (set at consume time from the
 * allowlist), NEVER from the client — a member can only ever see their own
 * submissions. Status is derived server-side via the shared `deriveStatus` so
 * the portal, the public status page, and the batch group never disagree.
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
  // The layout guard + hooks already enforce this; re-assert so the scoped
  // query can never run with an undefined member_id (which would match NULLs).
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

  const auslagen = rows.map((r) => ({
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    // Verein-scale amounts fit safely in a JS number; formatMoney takes cents.
    betragCents: Number(r.betragCents),
    rechnungsdatum: r.rechnungsdatum,
    status: deriveStatus({
      decision: r.decision,
      decidedAt: r.decidedAt,
      reviewedAt: r.reviewedAt,
      erstattetAm: r.erstattetAm,
    }),
  }));

  return { auslagen };
};
