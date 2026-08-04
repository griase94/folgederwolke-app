/**
 * /portal/auslagen/[ausId] — a member's own Auslage in detail (A-flow S2b).
 *
 * SECURITY: the lookup is scoped to `bezahlt_von_member_id = session member`
 * IN THE WHERE CLAUSE, never as a post-fetch check. Someone else's AUS-Nr is a
 * 404, not a 403 — a member must not be able to probe which numbers exist.
 *
 * The row is projected into the SHARED `StatusNode`, so the member detail, the
 * public status page and the batch group render the same facts, the same
 * timeline and the same copy for an identical submission.
 */

import { error, redirect } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { files } from "$lib/server/db/schema/files.js";
import { deriveStatus } from "$lib/server/domain/auslage-status.js";
import { maskIbanDisplay } from "$lib/domain/iban.js";
import type { StatusNode } from "$lib/components/auslagen/status-detail-builder.js";

export const load: PageServerLoad = async ({ locals, params }) => {
  const memberId = locals.session?.user.memberId;
  if (!memberId) redirect(303, "/app");

  const db = getDb();
  const [row] = await db
    .select({
      businessId: auslagenSubmissions.businessId,
      bezeichnung: auslagenSubmissions.bezeichnung,
      betragCents: auslagenSubmissions.betragCents,
      rechnungsdatum: auslagenSubmissions.rechnungsdatum,
      submittedAt: auslagenSubmissions.submittedAt,
      reviewedAt: auslagenSubmissions.reviewedAt,
      decision: auslagenSubmissions.decision,
      decidedAt: auslagenSubmissions.decidedAt,
      decisionReason: auslagenSubmissions.decisionReason,
      erstattungIban: auslagenSubmissions.erstattungIban,
      belegVerzichtGrund: auslagenSubmissions.belegVerzichtGrund,
      belegOriginalName: files.originalFilename,
      erstattetAm: expenses.erstattetAm,
    })
    .from(auslagenSubmissions)
    .leftJoin(expenses, eq(expenses.id, auslagenSubmissions.approvedExpenseId))
    .leftJoin(files, eq(files.id, auslagenSubmissions.belegFileId))
    .where(
      and(
        eq(auslagenSubmissions.businessId, params.ausId),
        eq(auslagenSubmissions.bezahltVonMemberId, memberId),
      ),
    )
    .limit(1);

  // Another member's Auslage is indistinguishable from one that never existed.
  if (!row) error(404, "Diese Auslage gibt es nicht.");

  const status = deriveStatus({
    decision: row.decision,
    decidedAt: row.decidedAt,
    reviewedAt: row.reviewedAt,
    erstattetAm: row.erstattetAm,
  });

  const node: StatusNode = {
    ausId: row.businessId,
    bezeichnung: row.bezeichnung,
    betragCents: Number(row.betragCents),
    status,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    rechnungsdatum: row.rechnungsdatum,
    erstattetAm: row.erstattetAm,
    // A rejection reason is only ever shown for a rejection.
    rejectReason: status === "abgelehnt" ? (row.decisionReason ?? null) : null,
    // The payout target, MASKED — like every IBAN in the portal.
    maskedIban: maskIbanDisplay(row.erstattungIban),
    belegFileName: row.belegOriginalName,
  };

  return { node, belegVerzichtGrund: row.belegVerzichtGrund };
};
