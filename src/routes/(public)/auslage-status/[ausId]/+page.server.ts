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
import { expenses } from "$lib/server/db/schema/expenses.js";
import { parseBusinessId } from "$lib/domain/business-id.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";

function maskIban(iban: string): string {
  if (iban.length <= 4) return "****";
  return `${"*".repeat(iban.length - 4)}${iban.slice(-4)}`;
}

/**
 * Map DB decision/state to a canonical public status label.
 *
 * Timeline:
 *   eingegangen   — submitted, admin has not opened it yet
 *   in_pruefung   — admin has opened it in the audit inbox (reviewed_at set)
 *   geprueft      — admin decided (approved); waiting for transfer
 *   erstattet     — approved AND the linked expense has erstattet_am set
 *   abgelehnt     — admin rejected the submission
 */
function deriveStatus(row: {
  decision: string | null;
  decidedAt: Date | null;
  reviewedAt: Date | null;
  erstattetAm: string | null;
}): "eingegangen" | "in_pruefung" | "geprueft" | "erstattet" | "abgelehnt" {
  if (row.decidedAt) {
    if (row.decision === "rejected") return "abgelehnt";
    if (row.decision === "approved" && row.erstattetAm) return "erstattet";
    return "geprueft";
  }
  if (row.reviewedAt) return "in_pruefung";
  return "eingegangen";
}

export const load: PageServerLoad = async ({ params, getClientAddress }) => {
  const { ausId } = params;

  // Path validation — AUS-{YYYY}-{NNN} format, prefix must be AUS.
  const parsed = parseBusinessId(ausId);
  if (!parsed || parsed.prefix !== "AUS") {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

  // Rate limit: 20 lookups / min / IP-prefix — prevents enumeration scraping.
  const ip = getClientAddress();
  const ipKey = ip.includes(":")
    ? (ip.split(":")[0] ?? ip.slice(0, 8))
    : ip.split(".").slice(0, 2).join(".");
  try {
    await checkAndRecord(`auslage:status:${ipKey}`, 20, 60 * 1000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw error(429, "Zu viele Anfragen — bitte einen Moment warten.");
    }
    throw err;
  }

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
      reviewedAt: true,
      approvedExpenseId: true,
      externIban: true,
      bezahltVonKind: true,
      bezahltVonDisplay: true,
    },
  });

  if (!row) {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

  // The "erstattet" terminal state requires the linked expense's
  // erstattet_am (date of bank transfer). Fetch it only when the submission
  // is approved AND has a linked expense row.
  let erstattetAm: string | null = null;
  if (row.decision === "approved" && row.approvedExpenseId) {
    const expense = await db.query.expenses.findFirst({
      where: eq(expenses.id, row.approvedExpenseId),
      columns: { erstattetAm: true },
    });
    erstattetAm = expense?.erstattetAm ?? null;
  }

  const status = deriveStatus({
    decision: row.decision,
    decidedAt: row.decidedAt,
    reviewedAt: row.reviewedAt,
    erstattetAm,
  });

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
