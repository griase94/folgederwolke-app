/**
 * /app/einnahmen — flat Einnahmen (income) list route shell (Phase 3, Task 10).
 *
 * Thin `load`: parse the Phase-2 filter state, read the layout year scope, clamp
 * the `?page` into range, then call `listEinnahmenPage` + the picker-option
 * loaders the Einnahmen FILTER_REGISTRY actually needs:
 *
 *   - `listKategorieOptions("income")` — the `kategorie` enum-multi filter is
 *     runtime-loaded; P2-04: its `value` is the kategorie NAME-SNAPSHOT string,
 *     so we map each KategorieOption → `{ value: name, label }`.
 *   - NO member picker — the Einnahmen registry has no member-picker field
 *     (X-PRAG-04), so we never call `listMemberOptions()` → `memberOptions: []`.
 *
 * Rich per-tab KPI/columns land in Phase 5 (Tier C); Phase 3 ships a minimal
 * KPI + default columns so the route works + the @phase-3 e2e smoke passes.
 */

import type { PageServerLoad } from "./$types.js";
import { listEinnahmenPage } from "$lib/server/domain/transactions.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("einnahmen", url.searchParams);

  // PAGE CLAMP (see ausgaben/+page.server.ts) — clamp the requested page into
  // [1, pages] before it drives the offset; re-query at the clamped offset only
  // when the request overshot the last page.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  let page = requestedPage;
  let { rows, total } = await listEinnahmenPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total } = await listEinnahmenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  // X-PRAG-04: Einnahmen needs the income kategorie options; no member filter.
  const kategorien = await listKategorieOptions("income");
  const kategorieOptions = kategorien.map((k) => ({
    value: k.name,
    label: k.name,
  }));

  return {
    tab: "einnahmen" as const,
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
