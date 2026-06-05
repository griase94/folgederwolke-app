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
 * Phase 5 (Tier C2): the rich KPI now comes from `listEinnahmenKpi` (the
 * C2-owned Sphären-Split aggregation, spec §8.1) and the Einnahmen columns
 * (🔗 badge, Sphäre left-rule, no status) live in `+page.svelte`. NO bulk
 * payload — Einnahmen has no bulk-select.
 */

import type { PageServerLoad } from "./$types.js";
import { listEinnahmenPage } from "$lib/server/domain/transactions.js";
import { listEinnahmenKpi } from "$lib/server/domain/einnahmen-kpi.js";
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

  // KPI + kategorie options in parallel (both independent of the row slice).
  // X-PRAG-04: Einnahmen needs the income kategorie options; no member filter.
  // listEinnahmenKpi is year-scoped (NOT filtered) — the Sphären-Split header
  // reflects the whole year, the row table reflects the active filters.
  const [kpi, kategorien] = await Promise.all([
    listEinnahmenKpi(yearScope),
    listKategorieOptions("income"),
  ]);
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
    kpi,
    kategorieOptions,
    memberOptions: [] as { id: string; label: string }[],
  };
};
