/**
 * GET /app/spenden/export — per-tab Spenden CSV export (Phase 8, T2).
 *
 * Emits the EXACT active filtered+sorted list (all pages, no pagination),
 * reusing listSpendenPage with limit:"all" so CSV-rows == screen-rows by
 * construction. No festschreibung gate — read-only point-in-time snapshot.
 *
 * Session gate: the /app prefix is globally protected in hooks.server.ts.
 *
 * Filter parsing mirrors spenden/+page.server.ts exactly.
 */

import type { RequestHandler } from "./$types.js";
import { listSpendenPage } from "$lib/server/domain/transactions.js";
import { buildTransactionsCsv } from "$lib/server/export/transactions-csv.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import { currentBuchungsjahr, ALL_YEARS, berlinYmd } from "$lib/domain/year.js";
import { resolveLayoutYear } from "$lib/server/domain/layout-year.js";
import { listAvailableYears } from "$lib/server/domain/years.js";

export const GET: RequestHandler = async ({ url }) => {
  const state = parseFilterState("spenden", url.searchParams);
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";

  const currentYear = currentBuchungsjahr();
  const availableYears = await listAvailableYears();
  const availableYearNumbers = availableYears.map((y) => y.year);
  const yearScope = resolveLayoutYear(
    url.searchParams,
    currentYear,
    availableYearNumbers,
  );

  const { rows } = await listSpendenPage({
    state,
    year: yearScope,
    sort,
    dir,
    limit: "all",
    offset: 0,
  });

  const csv = buildTransactionsCsv(rows, "spenden");
  const bytes = new TextEncoder().encode(csv);

  const yearLabel = yearScope === ALL_YEARS ? "alle" : String(yearScope);
  // ADR-0001: Berlin-local date (UTC .toISOString().slice(0,10) shows
  // yesterday between ~22:00–23:59 Berlin time).
  const date = berlinYmd();
  const filename = `spenden-${yearLabel}-${date}.csv`;

  return new Response(bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
