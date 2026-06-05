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
  let page = requestedPage;
  let { rows, total } = await listAusgabenPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total } = await listAusgabenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
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
  | "fehler";
interface RowResult {
  id: string;
  status: RowStatus;
  /** Present for `festgeschrieben` / `fehler` so the toast can show the reason. */
  error?: string;
}

/**
 * Mark each selected expense as erstattet, ONE `markExpenseErstattet` per row.
 * Each call fires the SEPA-payout confirmation mail (no knob; the bulk pool is
 * member/extern-only). Returns a PER-ROW result array so the UI can show the
 * §7.1 partial-failure summary ("9 erstattet, 1 festgeschrieben") instead of
 * the legacy single `fail(409, "a; b")`.
 */
async function bulkMarkErstattet(
  request: Request,
  actorUserId: string,
): Promise<{ ok: boolean; results: RowResult[] } | ReturnType<typeof fail>> {
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

  for (const expenseId of expenseIds) {
    const result = await markExpenseErstattet({
      expenseId,
      chosenDate,
      zahlungsartId,
      actorUserId,
    });
    if (result.ok) {
      results.push({
        id: expenseId,
        status: result.alreadyErstattet ? "bereits-erstattet" : "erstattet",
      });
    } else {
      // 409 from the festschreibung gate (or the row being sealed) is the
      // "festgeschrieben" partial-failure case; anything else is a generic row
      // error. Either way it stays a PER-ROW status, never a thrown action fail.
      results.push({
        id: expenseId,
        status: result.status === 409 ? "festgeschrieben" : "fehler",
        error: result.error,
      });
    }
  }

  // `ok` reflects "no hard row errors" — partial festgeschrieben/already rows
  // are expected outcomes the summary toast renders, not action failures.
  const ok = results.every((r) => r.status !== "fehler");
  return { ok, results };
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
