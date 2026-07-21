/**
 * Shared Einnahmen-list loader — the single source of truth for the flat
 * income-list PageData, used by BOTH `/app/einnahmen` (the list route) and
 * `/app/einnahmen/neu` (the Kulisse backdrop behind the entry dialog).
 * Extracting it keeps the two loads byte-identical so the backdrop is the real
 * list, never a drifting copy. Filter/pagination/KPI logic is unchanged.
 */
import { listEinnahmenPage } from "$lib/server/domain/transactions.js";
import { listEinnahmenKpi } from "$lib/server/domain/einnahmen-kpi.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import type { EinnahmenRow } from "$lib/server/domain/transactions.js";
import type { YearScope } from "$lib/domain/year.js";

const PAGE_SIZE = 50;

export interface EinnahmenListData {
  tab: "einnahmen";
  rows: EinnahmenRow[];
  total: number;
  page: number;
  pageSize: number;
  filterState: ReturnType<typeof parseFilterState>;
  yearScope: YearScope;
  currentYear: number;
  kpi: Awaited<ReturnType<typeof listEinnahmenKpi>>;
  kategorieOptions: { value: string; label: string }[];
  memberOptions: { id: string; label: string }[];
}

export async function loadEinnahmenListData(opts: {
  url: URL;
  yearScope: YearScope;
  currentYear: number;
}): Promise<EinnahmenListData> {
  const { url, yearScope, currentYear } = opts;
  const state = parseFilterState("einnahmen", url.searchParams);

  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  let page = requestedPage;
  let { rows, total } = await listEinnahmenPage({
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
    ({ rows, total } = await listEinnahmenPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
      dir,
    }));
  }

  const [kpi, kategorien] = await Promise.all([
    listEinnahmenKpi(yearScope),
    listKategorieOptions("income"),
  ]);
  const kategorieOptions = kategorien.map((k) => ({
    value: k.name,
    label: k.name,
  }));

  return {
    tab: "einnahmen",
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
    kpi,
    kategorieOptions,
    memberOptions: [],
  };
}
