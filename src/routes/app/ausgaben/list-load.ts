/**
 * Shared Ausgaben-list loader — the single source of truth for the flat
 * expense-list PageData, used by BOTH `/app/ausgaben` (the list route) and
 * `/app/ausgaben/neu` (the Kulisse: the list renders as the inert backdrop
 * behind the entry dialog). Extracting it keeps the two loads byte-identical so
 * the backdrop is the real list, never a drifting copy.
 *
 * The filter/pagination/KPI logic is unchanged from the original list `load`
 * (page-clamp, KPI pill, kategorie options; bezahltVon is an enum so
 * memberOptions stays empty — X-PRAG-04).
 */
import { listAusgabenPage } from "$lib/server/domain/transactions.js";
import { listAusgabenKpi } from "$lib/server/domain/ausgaben-kpi.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import type { AusgabenRow } from "$lib/server/domain/transactions.js";
import type { YearScope } from "$lib/domain/year.js";

const PAGE_SIZE = 50;

export interface AusgabenListData {
  tab: "ausgaben";
  rows: AusgabenRow[];
  total: number;
  page: number;
  pageSize: number;
  filterState: ReturnType<typeof parseFilterState>;
  yearScope: YearScope;
  currentYear: number;
  kpi: Awaited<ReturnType<typeof listAusgabenKpi>>;
  kategorieOptions: { value: string; label: string }[];
  memberOptions: { id: string; label: string }[];
}

export async function loadAusgabenListData(opts: {
  url: URL;
  yearScope: YearScope;
  currentYear: number;
}): Promise<AusgabenListData> {
  const { url, yearScope, currentYear } = opts;
  const state = parseFilterState("ausgaben", url.searchParams);

  // PAGE CLAMP: clamp the requested page into [1, pages] before it drives the
  // offset so an out-of-bounds ?page=99 can't show a garbage range.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
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

  const [kpi, kategorien] = await Promise.all([
    listAusgabenKpi(yearScope),
    listKategorieOptions("expense"),
  ]);
  const kategorieOptions = kategorien.map((k) => ({
    value: k.name,
    label: k.name,
  }));

  return {
    tab: "ausgaben",
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
