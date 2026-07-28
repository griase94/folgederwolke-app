/**
 * /auslage-status/[ausId] — public, no-auth status tracker (Aurora A-flow S1).
 *
 * The AUS-Nr itself is the public token. Any AUS-Nr of a batch opens the WHOLE
 * group (single = a group of one — ONE render path); the requested node is the
 * deep-link focus. Each node carries its OWN status — a batch is never averaged
 * to a pseudo-status (brief §3.6).
 *
 * Returns per node: status, dates, amount (rendered PLUM by the page), masked
 * IBAN (extern only, last 4), reject reason, Beleg filename. NEVER the full IBAN
 * or the e-mail. 404 on unknown/malformed → the route's +error.svelte renders
 * the AUS-search. Rate-limited to blunt enumeration.
 */

import { error } from "@sveltejs/kit";
import { eq, inArray } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { parseBusinessId } from "$lib/domain/business-id.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";
import { deriveStatus, maskIban } from "$lib/server/domain/auslage-status.js";

const NODE_COLUMNS = {
  businessId: true,
  bezeichnung: true,
  betragCents: true,
  currency: true,
  submittedAt: true,
  decidedAt: true,
  decision: true,
  decisionReason: true,
  reviewedAt: true,
  approvedExpenseId: true,
  rechnungsdatum: true,
  externIban: true,
  bezahltVonKind: true,
  bezahltVonDisplay: true,
  belegOriginalName: true,
  submissionGroupId: true,
} as const;

export const load: PageServerLoad = async ({ params, getClientAddress }) => {
  const { ausId } = params;
  const parsed = parseBusinessId(ausId);
  if (!parsed || parsed.prefix !== "AUS") {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

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
    columns: NODE_COLUMNS,
  });
  if (!row) {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

  const rows = row.submissionGroupId
    ? await db.query.auslagenSubmissions.findMany({
        where: eq(auslagenSubmissions.submissionGroupId, row.submissionGroupId),
        orderBy: (t, { asc }) => [asc(t.businessId)],
        columns: NODE_COLUMNS,
      })
    : [row];

  // Batch expense lookup for all approved nodes (erstattet_am) — no N+1.
  const expenseIds = rows
    .filter((r) => r.decision === "approved" && r.approvedExpenseId)
    .map((r) => r.approvedExpenseId!);
  const erstattetByExpense = new Map<string, string | null>();
  if (expenseIds.length > 0) {
    const exp = await db
      .select({ id: expenses.id, erstattetAm: expenses.erstattetAm })
      .from(expenses)
      .where(inArray(expenses.id, expenseIds));
    for (const e of exp) erstattetByExpense.set(e.id, e.erstattetAm);
  }

  const nodes = rows.map((r) => {
    const erstattetAm =
      r.decision === "approved" && r.approvedExpenseId
        ? (erstattetByExpense.get(r.approvedExpenseId) ?? null)
        : null;
    const status = deriveStatus({
      decision: r.decision,
      decidedAt: r.decidedAt,
      reviewedAt: r.reviewedAt,
      erstattetAm,
    });
    return {
      ausId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      status,
      submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      rechnungsdatum: r.rechnungsdatum, // ISO date string or null
      erstattetAm, // ISO date string or null
      rejectReason: status === "abgelehnt" ? (r.decisionReason ?? null) : null,
      maskedIban:
        r.externIban && r.bezahltVonKind === "extern"
          ? maskIban(r.externIban)
          : null,
      belegFileName: r.belegOriginalName,
    };
  });

  return {
    focusAusId: row.businessId,
    submittedAt: nodes[0]?.submittedAt ?? row.submittedAt.toISOString(),
    gesamtCents: nodes.reduce((s, n) => s + n.betragCents, 0),
    nodes,
  };
};
