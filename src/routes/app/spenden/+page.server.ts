/**
 * /app/spenden — flat Spenden (donation) list route shell (Phase 3, Task 10).
 *
 * Thin `load`: parse the Phase-2 filter state, read the layout year scope, clamp
 * the `?page` into range, then call `listSpendenPage` + the picker-option loaders
 * the Spenden FILTER_REGISTRY actually needs:
 *
 *   - NO kategorie filter — the Spenden registry has no `kategorie` field
 *     (X-PRAG-04), so we never call `listKategorieOptions()` → `kategorieOptions: []`.
 *   - `listMemberOptions()` — the `spender` field IS a member-picker, so the
 *     scaffold's member-picker dropdown needs the member options.
 *
 * Rich per-tab KPI/columns land in Phase 6 (Tier C); Phase 3 ships a minimal
 * KPI + default columns so the route works + the @phase-3 e2e smoke passes.
 */

import type { PageServerLoad } from "./$types.js";
import { listSpendenPage } from "$lib/server/domain/transactions.js";
import { listMemberOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("spenden", url.searchParams);

  // PAGE CLAMP (see ausgaben/+page.server.ts) — clamp the requested page into
  // [1, pages] before it drives the offset; re-query at the clamped offset only
  // when the request overshot the last page.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  let page = requestedPage;
  let { rows, total } = await listSpendenPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total } = await listSpendenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  // X-PRAG-04: Spenden has NO kategorie filter (→ []); the Spender filter IS a
  // member-picker, so it needs the member options.
  const memberOptions = await listMemberOptions();

  return {
    tab: "spenden" as const,
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
    kategorieOptions: [] as { value: string; label: string }[],
    memberOptions,
  };
};
