/**
 * /auslage-status/[ausId] — public, no-auth status tracker.
 *
 * The AUS-ID itself is the public token. Anyone who knows it can view the
 * submission status. No session required.
 *
 * Returns: status, dates, masked IBAN (last 4 digits only), bezeichnung.
 * 404 if the AUS-ID is not found.
 */

import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";

function maskIban(iban: string): string {
  if (iban.length <= 4) return "****";
  return `${"*".repeat(iban.length - 4)}${iban.slice(-4)}`;
}

/** Map DB decision/state to a canonical public status label. */
function deriveStatus(
  row: Pick<
    typeof auslagenSubmissions.$inferSelect,
    "decision" | "decidedAt" | "submittedAt"
  >,
): "eingegangen" | "in_pruefung" | "geprueft" | "erstattet" | "abgelehnt" {
  if (row.decision === "approved") return "erstattet";
  if (row.decision === "rejected") return "abgelehnt";
  if (row.decidedAt) return "geprueft";
  return "eingegangen";
}

export const load: PageServerLoad = async ({ params }) => {
  const { ausId } = params;

  const db = getDb();

  const row = await db.query.auslagenSubmissions.findFirst({
    where: eq(auslagenSubmissions.businessId, ausId),
    columns: {
      businessId: true,
      bezeichnung: true,
      betragCents: true,
      currency: true,
      submittedAt: true,
      decidedAt: true,
      decision: true,
      externIban: true,
      bezahltVonKind: true,
      bezahltVonDisplay: true,
    },
  });

  if (!row) {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

  const status = deriveStatus(row);

  return {
    ausId: row.businessId,
    bezeichnung: row.bezeichnung,
    betragCents: Number(row.betragCents),
    currency: row.currency,
    submittedAt: row.submittedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    status,
    bezahltVonDisplay: row.bezahltVonDisplay,
    maskedIban:
      row.externIban && row.bezahltVonKind === "extern"
        ? maskIban(row.externIban)
        : null,
  };
};
