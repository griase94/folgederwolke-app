/**
 * /app/ausgaben — flat Ausgaben (expense) list route shell (Phase 3, Task 10).
 *
 * Thin `load`: parse the Phase-2 filter state, read the layout year scope, clamp
 * the `?page` into range, then call `listAusgabenPage` + the picker-option
 * loaders the Ausgaben FILTER_REGISTRY actually needs:
 *
 *   - `listKategorieOptions("expense")` — the `kategorie` enum-multi filter is
 *     runtime-loaded; P2-04: its `value` is the kategorie NAME-SNAPSHOT string
 *     (matches the `kategorieNameSnapshot` column the WHERE builder feeds to
 *     `inArray(…)`), so we map each KategorieOption → `{ value: name, label }`.
 *   - NO member picker — the Ausgaben `bezahltVon` field is an enum-multi, not a
 *     member-picker (X-PRAG-04), so the scaffold's `memberOptions` is unused →
 *     pass `[]` (we never call `listMemberOptions()`).
 *
 * The rich per-tab KPI/columns land in Phase 4 (Tier C); Phase 3 ships a minimal
 * KPI + default columns so the route works + the @phase-3 e2e smoke passes.
 */

import type { PageServerLoad } from "./$types.js";
import { listAusgabenPage } from "$lib/server/domain/transactions.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  // Year scope from the layout (Task 2): `yearScope` keeps the ALL_YEARS
  // ("Alle Jahre") sentinel so the unfiltered-across-years list survives; the
  // WHERE builder treats ALL_YEARS as "no year predicate". `currentYear` drives
  // the stale-year banner. (`selectedYear` is the concrete fallback — unused for
  // the query so ALL_YEARS isn't collapsed to a single year here.)
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("ausgaben", url.searchParams);

  // PAGE CLAMP (pagination review carry-forward): clamp the requested page into
  // [1, pages] BEFORE it drives the offset so an out-of-bounds ?page=99 can't
  // show a garbage range or an empty page. `total` is only known after a query,
  // so we run once at the low-clamped offset, then re-query at the clamped
  // offset only when the request overshot the last page.
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

  // X-PRAG-04: Ausgaben needs the expense kategorie options; bezahltVon is an
  // enum (no member picker) → memberOptions stays empty.
  const kategorien = await listKategorieOptions("expense");
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
    kategorieOptions,
    memberOptions: [] as { id: string; label: string }[],
  };
};
