/**
 * /app/ausgaben/ueberweisungen — Überweisungsliste (Aurora slice 4, spec §7).
 *
 * ABSORBS (replaces, no parallel surface — no-compat rule) the SepaCopyModal +
 * BulkActionsBar flow that lived on /app/ausgaben: the approved-pending pool
 * (listApprovedPendingErstattet) renders as a manual banking worklist with
 * per-claim copy buttons; "Als erstattet markieren" keeps the EXACT
 * bulk-mark-erstattet semantics (one markExpenseErstattet per row, each fires
 * the SEPA-payout confirmation mail — ADR-0005 dedupes re-sends).
 *
 * The /api/sepa/generate endpoint stays (removal decision is a backlog issue,
 * spec §11) but is no longer reachable from the UI.
 *
 * Bulk Erstattung moved here from /app/ausgaben (Aurora slice 4 — Überweisungsliste
 * absorbs the SepaCopyModal flow).
 */
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  listApprovedPendingErstattet,
  listZahlungsarten,
} from "$lib/server/domain/transactions.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { isoCalendarDate } from "$lib/domain/date.js";
import { claimName } from "$lib/domain/ueberweisung.js";
import { erstattungsVerwendungszweck } from "$lib/server/domain/erstattung-verwendungszweck.js";
import { env } from "$lib/server/env.js";

export const load: PageServerLoad = async () => {
  const [rows, zahlungsarten] = await Promise.all([
    listApprovedPendingErstattet(),
    listZahlungsarten(),
  ]);

  // Everything the Werkstatt shows is decided HERE, so the bank form and the
  // reimbursement mail cannot drift: the payout IBAN is already resolved by M4
  // precedence, and the Verwendungszweck comes from the one shared function
  // the mail also uses (Abnahme #14).
  const claims = rows.map((r) => ({
    id: r.id,
    ausNr: r.ausNr,
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    betragCents: r.betragCents,
    empfaenger: claimName(r),
    payoutIban: r.payoutIban,
    verwendungszweck: erstattungsVerwendungszweck(r.ausNr, env.VEREIN_NAME),
    festgeschrieben: r.festgeschrieben,
    // Where the gap can be closed: the Mitglied for a member, the Ausgabe for
    // an extern payer.
    ibanFixHref: r.bezahltVonMemberId
      ? `/app/mitglieder/${r.bezahltVonMemberId}`
      : `/app/ausgaben/${r.id}`,
  }));

  const gesamtCents = claims.reduce((sum, c) => sum + c.betragCents, 0);
  const countIbanFehlt = claims.filter((c) => c.payoutIban === null).length;

  return { claims, zahlungsarten, gesamtCents, countIbanFehlt };
};

// ---------------------------------------------------------------------------
// bulk-mark-erstattet — moved verbatim from /app/ausgaben/+page.server.ts
// ---------------------------------------------------------------------------

const bulkMarkErstattetSchema = z.object({
  expenseIds: z.string().transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  chosenDate: isoCalendarDate,
  zahlungsartId: z.string().uuid(),
});

type RowStatus =
  | "erstattet"
  | "bereits-erstattet"
  | "festgeschrieben"
  | "iban-fehlt"
  | "nicht-gefunden"
  | "fehler";
interface RowResult {
  id: string;
  status: RowStatus;
  error?: string;
}

interface BulkSummary {
  erstattet: string[];
  festgeschrieben: string[];
  /**
   * Skipped because there is no payout account (§7). Its own bucket, not a
   * generic error: nothing went wrong, the claim simply cannot be paid yet —
   * and the result toast has to say so, otherwise a partly-successful batch
   * looks like a failure.
   */
  ibanFehlt: string[];
  bereitsBezahlt: string[];
  notFound: string[];
  fehler: { id: string; error: string }[];
}

async function bulkMarkErstattet(
  request: Request,
  actorUserId: string,
): Promise<
  | { ok: boolean; results: RowResult[]; summary: BulkSummary }
  | ReturnType<typeof fail>
> {
  const data = await request.formData();
  const parsed = bulkMarkErstattetSchema.safeParse({
    expenseIds: data.get("expenseIds"),
    chosenDate: data.get("chosenDate"),
    zahlungsartId: data.get("zahlungsartId"),
  });
  if (!parsed.success) {
    return fail(422, { error: "Ungültige Eingabe" });
  }

  const { expenseIds, chosenDate, zahlungsartId } = parsed.data;
  const results: RowResult[] = [];
  const summary: BulkSummary = {
    erstattet: [],
    festgeschrieben: [],
    ibanFehlt: [],
    bereitsBezahlt: [],
    notFound: [],
    fehler: [],
  };

  for (const expenseId of expenseIds) {
    const result = await markExpenseErstattet({
      expenseId,
      chosenDate,
      zahlungsartId,
      actorUserId,
    });
    if (result.ok) {
      if (result.alreadyErstattet) {
        results.push({ id: expenseId, status: "bereits-erstattet" });
        summary.bereitsBezahlt.push(expenseId);
      } else {
        results.push({ id: expenseId, status: "erstattet" });
        summary.erstattet.push(expenseId);
      }
    } else if (result.status === 409) {
      results.push({
        id: expenseId,
        status: "festgeschrieben",
        error: result.error,
      });
      summary.festgeschrieben.push(expenseId);
    } else if (result.status === 422) {
      // §7 — the server refused for a missing payout account. The client is
      // supposed to skip these, but it may send them anyway (or the IBAN may
      // have vanished between render and submit), so the batch reports them
      // rather than counting them as failures.
      results.push({
        id: expenseId,
        status: "iban-fehlt",
        error: result.error,
      });
      summary.ibanFehlt.push(expenseId);
    } else if (result.status === 404) {
      results.push({
        id: expenseId,
        status: "nicht-gefunden",
        error: result.error,
      });
      summary.notFound.push(expenseId);
    } else {
      results.push({ id: expenseId, status: "fehler", error: result.error });
      summary.fehler.push({ id: expenseId, error: result.error });
    }
  }

  // A skipped IBAN-less claim is a reportable outcome, not a failure — `ok`
  // stays true so the toast reads "partly done" rather than "broken".
  const ok = summary.fehler.length === 0;
  return { ok, results, summary };
}

export const actions = {
  "bulk-mark-erstattet": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });
    return bulkMarkErstattet(request, user.id);
  },
} satisfies Actions;
