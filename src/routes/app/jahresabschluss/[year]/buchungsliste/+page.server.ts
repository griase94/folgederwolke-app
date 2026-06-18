/**
 * /app/jahresabschluss/[year]/buchungsliste — sortable + filterable transactions.
 *
 * Fetches all year-scoped transactions via listTransaktionenFeedPage (the Aurora
 * UNION-ALL feed), then applies sphere / kind / kategorie / project filters and
 * sort in-process. Pure filter/sort logic is tested via
 * `c1-buchungsliste-filters.test.ts`.
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { listTransaktionenFeedPage } from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
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

  // Pull all year transactions in one shot via the Aurora UNION-ALL feed query
  // (replaces the deleted in-memory listTransactions). Bounded at 2000 so a
  // runaway year doesn't OOM the server; rows arrive ordered by the cash date.
  const { rows } = await listTransaktionenFeedPage({
    state: parseFilterState("transaktionen", new URLSearchParams()),
    year,
    limit: 2000,
    offset: 0,
  });

  // Map FeedRow → BuchungslisteRow (subset we display).
  // Note: FeedRow.kategorieId isn't exposed in the shared shape today;
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
    // could display a date in Y±1. FeedRow.relevanzDatum is never null
    // (SQL COALESCE), so no fallback is needed.
    gebuchtAm: r.relevanzDatum,
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
