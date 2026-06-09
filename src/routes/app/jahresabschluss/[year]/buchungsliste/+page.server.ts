/**
 * /app/jahresabschluss/[year]/buchungsliste — sortable + filterable transactions.
 *
 * Fetches all year-scoped transactions via listTransactions(year), then applies
 * sphere / kind / kategorie / project filters and sort in-process. Pure
 * filter/sort logic is tested via `c1-buchungsliste-filters.test.ts`.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { listTransactions } from "$lib/server/domain/transactions.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { getDb } from "$lib/server/db/index.js";
import {
  parseBuchungslisteFilters,
  filterAndSortRows,
  type BuchungslisteRow,
} from "$lib/server/eur/buchungsliste.js";

export const load: PageServerLoad = async ({ params, url }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const filters = parseBuchungslisteFilters(url.searchParams);

  // Pull all year transactions in one shot — limit high enough for typical
  // Verein year. listTransactions caps at 1000 by default; bump to 2000 for
  // headroom but still bounded so a runaway year doesn't OOM the server.
  const { rows } = await listTransactions({ year, limit: 2000 });

  // Map TransactionRow → BuchungslisteRow (subset we display).
  // Note: TransactionRow.kategorieId isn't exposed in the shared shape today;
  // we use kategorieNameSnapshot as the display string and synthesize the
  // kategorieId/projectId from the detail query only when filtering is on.
  // For c1's minimum viable cut, we filter against the name snapshot as a
  // fallback when kategorie/project IDs aren't on the row.
  const mapped: BuchungslisteRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    betragCents: r.betragCents,
    // The Buchungsliste sorts + displays the booking date. Post-0034 a row's
    // fiscal year derives from the cash date, so the date shown must be the
    // cash-relevant date (relevanz_datum) too — else a row filtered into year Y
    // could display a date in Y±1. Fall back to gebucht_am when no cash date.
    gebuchtAm: r.relevanzDatum ?? r.gebuchtAm,
    sphereSnapshot: r.sphereSnapshot,
    kategorieId: null,
    kategorieNameSnapshot: r.kategorieNameSnapshot,
    projectId: null,
    belegDriveFileId: null,
    festgeschriebenAt: r.festgeschriebenAt,
  }));

  const filtered = filterAndSortRows(mapped, filters);

  // Lookup tables for filter chips
  const db = getDb();
  const [kategorienOpts, projectsOpts] = await Promise.all([
    db
      .select({ id: kategorien.id, name: kategorien.name })
      .from(kategorien)
      .orderBy(kategorien.name),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(projects.name),
  ]);

  return {
    filters,
    rows: filtered,
    totalRows: filtered.length,
    allRowsCount: mapped.length,
    kategorien: kategorienOpts,
    projects: projectsOpts,
  };
};
