/**
 * Shared Spenden-list loader — the single source of truth for the flat
 * donation-list PageData, used by BOTH `/app/spenden` (the list route) and
 * `/app/spenden/neu` (the Kulisse backdrop behind the entry dialog). Extracting
 * it keeps the two loads byte-identical so the backdrop is the real list, never
 * a drifting copy. Filter/pagination/KPI logic is unchanged (X-PRAG-04: no
 * kategorie filter; the Spender field is a member-picker).
 */
import { listSpendenPage } from "$lib/server/domain/transactions.js";
import { listSpendenKpi } from "$lib/server/domain/spenden-kpi.js";
import { listMemberOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import type { SpendenRow } from "$lib/server/domain/transactions.js";
import type { YearScope } from "$lib/domain/year.js";

const PAGE_SIZE = 50;

export interface SpendenListData {
  tab: "spenden";
  rows: SpendenRow[];
  total: number;
  page: number;
  pageSize: number;
  filterState: ReturnType<typeof parseFilterState>;
  yearScope: YearScope;
  currentYear: number;
  kpi: Awaited<ReturnType<typeof listSpendenKpi>>;
  kategorieOptions: { value: string; label: string }[];
  memberOptions: Awaited<ReturnType<typeof listMemberOptions>>;
}

export async function loadSpendenListData(opts: {
  url: URL;
  yearScope: YearScope;
  currentYear: number;
}): Promise<SpendenListData> {
  const { url, yearScope, currentYear } = opts;
  const state = parseFilterState("spenden", url.searchParams);

  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  let page = requestedPage;
  let { rows, total } = await listSpendenPage({
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
    ({ rows, total } = await listSpendenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
      dir,
    }));
  }

  const [kpi, memberOptions] = await Promise.all([
    listSpendenKpi(yearScope),
    listMemberOptions(),
  ]);

  return {
    tab: "spenden",
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
    kpi,
    kategorieOptions: [],
    memberOptions,
  };
}
