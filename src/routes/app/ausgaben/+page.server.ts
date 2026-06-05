/**
 * /app/ausgaben — flat Ausgaben (expense) list route (Phase 4, Tier C1).
 *
 * Replaces the Phase-3 placeholder `load` with the Ausgaben-specific one. The
 * shape the Phase-3 list-route test asserts is preserved (tab/rows/total/page/
 * filterState/yearScope/currentYear/kategorieOptions/memberOptions, page-clamp,
 * year forwarding); Phase 4 ADDS:
 *
 *   - `kpi`             — `listAusgabenKpi(yearScope)` → the "N offen · älteste
 *                         X Tage" header pill (spec §7.1).
 *   - `approvedPending` — `listApprovedPendingErstattet()` → the bulk pool the
 *                         BulkActionsBar / SepaCopyModal operate on (member/
 *                         extern rows awaiting Erstattung; Verein-direct rows
 *                         are created already-erstattet and never appear here).
 *   - `zahlungsarten`   — for the bulk + post-SEPA Zahlungsart pickers.
 *
 * actions (Task 3 — moved here from the legacy `transactions/+page.server.ts`):
 *   ?/bulk-mark-erstattet  — mark N approved Auslagen as erstattet, ONE
 *                            `markExpenseErstattet` per row (each fires the
 *                            SEPA-payout confirmation mail — no knob). Returns a
 *                            PER-ROW result array `{ results: {id,status}[] }`
 *                            (spec §7.1 partial-failure summary), NOT the legacy
 *                            single `fail(409, "a; b")`.
 *   ?/sepa-mark-erstattet  — same per-row semantics; the post-SEPA modal path.
 *
 * X-PRAG-04: the Ausgaben `bezahltVon` filter is an enum (not a member picker),
 * so `memberOptions` stays empty.
 */

import { fail } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  listAusgabenPage,
  listApprovedPendingErstattet,
  listZahlungsarten,
} from "$lib/server/domain/transactions.js";
import { listAusgabenKpi } from "$lib/server/domain/ausgaben-kpi.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  // Year scope from the layout (Phase 3): `yearScope` keeps the ALL_YEARS
  // ("Alle Jahre") sentinel so the unfiltered-across-years list survives; the
  // WHERE builder + the KPI treat ALL_YEARS as "no year predicate".
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("ausgaben", url.searchParams);

  // PAGE CLAMP: clamp the requested page into [1, pages] BEFORE it drives the
  // offset so an out-of-bounds ?page=99 can't show a garbage range. `total` is
  // only known after a query, so we run once at the low-clamped offset, then
  // re-query at the clamped offset only when the request overshot the last page.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  // Sort plumbing (§13): the scaffold emits ?sort=<column key>&dir=asc|desc.
  // listAusgabenPage applies an ORDER-BY whitelist, so an unknown key safely
  // falls back to gebuchtAm desc.
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  let page = requestedPage;
  let { rows, total } = await listAusgabenPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sort,
    dir,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total } = await listAusgabenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
      dir,
    }));
  }

  // Phase 4 additions: the header KPI pill, the bulk pool, and the Zahlungsart
  // options — alongside the X-PRAG-04 kategorie options (bezahltVon is an enum,
  // so memberOptions stays empty).
  const [kpi, kategorien, approvedPending, zahlungsarten] = await Promise.all([
    listAusgabenKpi(yearScope),
    listKategorieOptions("expense"),
    listApprovedPendingErstattet(),
    listZahlungsarten(),
  ]);
  const kategorieOptions = kategorien.map((k) => ({
    value: k.name,
    label: k.name,
  }));

  return {
    tab: "ausgaben" as const,
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
    kpi,
    approvedPending,
    zahlungsarten,
    kategorieOptions,
    memberOptions: [] as { id: string; label: string }[],
  };
};

// ---------------------------------------------------------------------------
// Bulk Als-bezahlt actions (Task 3)
// ---------------------------------------------------------------------------

const bulkMarkErstattetSchema = z.object({
  expenseIds: z.string().transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  chosenDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zahlungsartId: z.string().uuid(),
});

/** Per-row outcome the BulkActionsBar / PostSepa summary toast renders. */
type RowStatus =
  | "erstattet"
  | "bereits-erstattet"
  | "festgeschrieben"
  | "nicht-gefunden"
  | "fehler";
interface RowResult {
  id: string;
  status: RowStatus;
  /** Present for the non-success rows so the toast can show the reason. */
  error?: string;
}

/**
 * Structured per-row summary (§8): the BulkActionsBar / PostSepa toast renders
 * it as "N erstattet, M festgeschrieben, …" instead of one concatenated error
 * string. Each bucket holds the affected expense IDs (or {id,error} for the
 * generic-error bucket).
 *
 * bereits-bezahlt bucket: the bulk pool is member/extern-only (Verein-direct
 * rows are created already-erstattet by `markExpenseAsPaid` and never enter
 * here), so a row that is already settled can only be one that was already
 * REIMBURSED — `markExpenseErstattet` reports that via `alreadyErstattet`,
 * which we map straight into `bereitsBezahlt`. The shared `markExpenseAsPaid`
 * double-pay fix now refuses an already-erstattet row with `{ok:false,
 * error:'bereits bezahlt'}` on the single-row (kebab/detail) path, keeping the
 * two entrypoints consistent: neither double-pays, and both surface the row as
 * "bereits bezahlt" rather than silently re-stamping it.
 */
interface BulkSummary {
  erstattet: string[];
  festgeschrieben: string[];
  bereitsBezahlt: string[];
  notFound: string[];
  fehler: { id: string; error: string }[];
}

/**
 * Mark each selected expense as erstattet, ONE `markExpenseErstattet` per row.
 * Each call fires the SEPA-payout confirmation mail (no knob; the bulk pool is
 * member/extern-only). Returns BOTH a per-row `results` array AND a structured
 * `summary` (§8) so the UI can show the partial-failure summary toast
 * ("9 erstattet, 1 festgeschrieben") instead of the legacy `fail(409, "a; b")`.
 */
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
      // 409 from the festschreibung gate (or the row being sealed).
      results.push({
        id: expenseId,
        status: "festgeschrieben",
        error: result.error,
      });
      summary.festgeschrieben.push(expenseId);
    } else if (result.status === 404) {
      results.push({
        id: expenseId,
        status: "nicht-gefunden",
        error: result.error,
      });
      summary.notFound.push(expenseId);
    } else {
      // Any other status (400/422/500/…) is a generic per-row error.
      results.push({ id: expenseId, status: "fehler", error: result.error });
      summary.fehler.push({ id: expenseId, error: result.error });
    }
  }

  // `ok` reflects "no hard row errors" — festgeschrieben / notFound / already
  // rows are expected partial outcomes the summary toast renders, not failures.
  const ok = summary.fehler.length === 0;
  return { ok, results, summary };
}

export const actions = {
  "bulk-mark-erstattet": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });
    return bulkMarkErstattet(request, user.id);
  },

  "sepa-mark-erstattet": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });
    // Same per-row semantics — the post-SEPA modal POSTs here after copying the
    // pain.001 XML; each row's ErstattungsMail still fires (no knob).
    return bulkMarkErstattet(request, user.id);
  },
} satisfies Actions;
