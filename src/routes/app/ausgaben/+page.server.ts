/**
 * /app/ausgaben — flat Ausgaben (expense) list route (Phase 4, Tier C1).
 *
 * Replaces the Phase-3 placeholder `load` with the Ausgaben-specific one. The
 * shape the Phase-3 list-route test asserts is preserved (tab/rows/total/page/
 * filterState/yearScope/currentYear/kategorieOptions/memberOptions, page-clamp,
 * year forwarding); Phase 4 ADDS:
 *
 *   - `kpi` — `listAusgabenKpi(yearScope)` → the "N offen · älteste X Tage"
 *             header pill (spec §7.1).
 *
 * Bulk Erstattung moved to /app/ausgaben/ueberweisungen (Aurora slice 4 —
 * Überweisungsliste absorbs the SepaCopyModal flow).
 *
 * X-PRAG-04: the Ausgaben `bezahltVon` filter is an enum (not a member picker),
 * so `memberOptions` stays empty.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  listAusgabenPage,
  getTransactionDetail,
  markExpenseAsPaid,
  checkFestschreibungGate,
} from "$lib/server/domain/transactions.js";
import { listAusgabenKpi } from "$lib/server/domain/ausgaben-kpi.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
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

  // Phase 4: the header KPI pill + kategorie options (bezahltVon is an enum,
  // so memberOptions stays empty). Bulk pool moved to /app/ausgaben/ueberweisungen.
  const [kpi, kategorien] = await Promise.all([
    listAusgabenKpi(yearScope),
    listKategorieOptions("expense"),
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
    kategorieOptions,
    memberOptions: [] as { id: string; label: string }[],
  };
};

export const actions = {
  /**
   * Single-row kebab quick action (C3-DISC): marks one expense as paid without
   * triggering the SEPA-mail flow. Accepts the expense ID from form data
   * (`expenseId`) so multiple rows can share the same action name.
   *
   * Mirrors the `?/mark-paid` on the detail page, but operates on any row in
   * the list without navigating away (the inline dialog posts here then the
   * scaffold re-fetches via enhanced form + invalidateAll).
   */
  "mark-paid": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const expenseId = data.get("expenseId");
    const datum = data.get("datum");
    const zahlartId = data.get("zahlartId") || null;

    if (typeof expenseId !== "string" || !expenseId) {
      return fail(422, { error: "Ungültige Ausgaben-ID" });
    }
    if (typeof datum !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      return fail(422, { error: "Ungültiges Datum" });
    }

    const detail = await getTransactionDetail(expenseId, "expense");
    if (!detail) return fail(404, { error: "Nicht gefunden" });

    const gate = await checkFestschreibungGate(
      detail.yearOfBuchung ?? new Date().getFullYear(),
    );
    if (!gate.ok) return fail(gate.status, { error: gate.error });

    const result = await markExpenseAsPaid(expenseId, {
      datum,
      zahlartId: typeof zahlartId === "string" && zahlartId ? zahlartId : null,
      actorUserId: user.id,
    });
    if (!result.ok) return fail(409, { error: result.error });
    return { ok: true, paid: true, expenseId };
  },
} satisfies Actions;
