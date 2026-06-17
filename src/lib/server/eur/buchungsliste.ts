/**
 * Buchungsliste tab — filter + sort helpers (pure, no DB).
 *
 * Consumed by /app/jahresabschluss/[year]/buchungsliste/+page.server.ts which
 * loads the year-scoped rows via listTransaktionenFeedPage(), maps them to
 * BuchungslisteRow, then applies these helpers in-process.
 *
 * For a ~1k-row year this keeps the SQL simple (single year filter) and
 * still meets the C1 perf budget (page render < 200ms median). If counts
 * grow past ~10k, push filters into SQL.
 */

import type { Sphere } from "$lib/server/domain/eur.js";

export type TransactionKindFilter = "income" | "expense" | "donation" | "all";
export type SphereFilter = Sphere | "all";
export type BuchungslisteSort =
  | "date-desc"
  | "date-asc"
  | "betrag-desc"
  | "betrag-asc";

export interface BuchungslisteFilters {
  sphere: SphereFilter;
  kind: TransactionKindFilter;
  kategorieId?: string;
  projectId?: string;
  sort: BuchungslisteSort;
}

export interface BuchungslisteRow {
  id: string;
  kind: "income" | "expense" | "donation";
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  /** YYYY-MM-DD or full ISO; lexicographic sort works for both because
   *  the YYYY-MM-DD prefix is monotonic. */
  gebuchtAm: string;
  sphereSnapshot: string;
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  projectId: string | null;
  belegDriveFileId: string | null;
  festgeschriebenAt: string | null;
}

const VALID_SORTS: ReadonlySet<BuchungslisteSort> = new Set([
  "date-desc",
  "date-asc",
  "betrag-desc",
  "betrag-asc",
]);

const VALID_SPHERES: ReadonlySet<string> = new Set([
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
]);

const VALID_KINDS: ReadonlySet<string> = new Set([
  "income",
  "expense",
  "donation",
]);

export function parseBuchungslisteFilters(
  searchParams: URLSearchParams,
): BuchungslisteFilters {
  const sortRaw = searchParams.get("sort") ?? "";
  const sort: BuchungslisteSort = VALID_SORTS.has(sortRaw as BuchungslisteSort)
    ? (sortRaw as BuchungslisteSort)
    : "date-desc";

  const sphereRaw = searchParams.get("sphere") ?? "";
  const sphere: SphereFilter = VALID_SPHERES.has(sphereRaw)
    ? (sphereRaw as Sphere)
    : "all";

  const kindRaw = searchParams.get("kind") ?? "";
  const kind: TransactionKindFilter = VALID_KINDS.has(kindRaw)
    ? (kindRaw as TransactionKindFilter)
    : "all";

  const kategorieIdRaw = searchParams.get("kategorie");
  const kategorieId =
    kategorieIdRaw && kategorieIdRaw.length > 0 ? kategorieIdRaw : undefined;

  const projectIdRaw = searchParams.get("project");
  const projectId =
    projectIdRaw && projectIdRaw.length > 0 ? projectIdRaw : undefined;

  return { sphere, kind, kategorieId, projectId, sort };
}

export function filterAndSortRows(
  rows: BuchungslisteRow[],
  filters: BuchungslisteFilters,
): BuchungslisteRow[] {
  let out = rows.slice();

  if (filters.sphere !== "all") {
    out = out.filter((r) => r.sphereSnapshot === filters.sphere);
  }
  if (filters.kind !== "all") {
    out = out.filter((r) => r.kind === filters.kind);
  }
  if (filters.kategorieId) {
    out = out.filter((r) => r.kategorieId === filters.kategorieId);
  }
  if (filters.projectId) {
    out = out.filter((r) => r.projectId === filters.projectId);
  }

  switch (filters.sort) {
    case "date-asc":
      out.sort((a, b) => a.gebuchtAm.localeCompare(b.gebuchtAm));
      break;
    case "date-desc":
      out.sort((a, b) => b.gebuchtAm.localeCompare(a.gebuchtAm));
      break;
    case "betrag-asc":
      out.sort((a, b) => a.betragCents - b.betragCents);
      break;
    case "betrag-desc":
      out.sort((a, b) => b.betragCents - a.betragCents);
      break;
  }

  return out;
}
