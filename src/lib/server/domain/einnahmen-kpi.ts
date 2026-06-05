/**
 * Einnahmen KPI aggregation — powers the Einnahmen list header (spec §8.1,
 * Phase 5 Task 1, Tier C2): the quiet anchor "Jahr · Summe · N" + the four
 * Sphären-Split chips (Ideeller / Vermögen / Zweckbetrieb / Wirtschaftlich).
 *
 * Read-only Drizzle query, mirroring the dashboard income-by-sphere idiom
 * (loadDashboardKpis query #16 in dashboard.ts): one grouped SELECT over
 * `income` keyed by `sphere_snapshot`, scoped by `year_of_buchung`, excluding
 * superseded rows (`isNull(supersedesId)` — the Festschreibung-Storno chain).
 * Money is integer cents (ADR-0003); bigint `sum()` strings are converted to
 * Number for the caller.
 *
 * C2-owned: lives in its OWN file (not `transactions.ts`) so the Einnahmen
 * track stays conflict-free with the parallel Ausgaben/Spenden tracks — mirrors
 * Phase 4's `ausgaben-kpi.ts` discipline.
 */

import { and, count, eq, isNull, sum } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { income } from "$lib/server/db/schema/income.js";
import { SPHERES, type Sphere } from "$lib/domain/sphere.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";

/** Per-sphere cents totals — all four keys always present (0 when empty). */
export type SphereBuckets = Record<Sphere, number>;

export interface EinnahmenKpi {
  /** Sum of betragCents across all non-superseded income in scope. */
  totalCents: number;
  /** Count of all non-superseded income in scope. */
  count: number;
  /**
   * Per-sphere split of `totalCents` (spec §8.1). Always carries all four
   * sphere keys — an empty sphere is present as `0` so the chip strip can
   * always render the full gemeinnützigkeit reading.
   */
  bySphere: SphereBuckets;
}

/** A grouped row from the per-sphere aggregation query. */
interface SphereGroupRow {
  sphere: string | null;
  sumCents: string | null;
  n: number;
}

/**
 * Pure fold: collapse the grouped per-sphere rows into the four-key
 * `bySphere` record + derive `totalCents` (sum of buckets) and `count`
 * (sum of group counts). Every sphere key defaults to `0` so empty spheres
 * are always present. Exported so the fold can be unit-tested on the fast
 * lane without a DB.
 */
export function foldSphereBuckets(rows: SphereGroupRow[]): EinnahmenKpi {
  const bySphere: SphereBuckets = {
    ideeller: 0,
    vermoegen: 0,
    zweckbetrieb: 0,
    wirtschaftlich: 0,
  };
  let totalCents = 0;
  let count = 0;
  for (const r of rows) {
    const cents = Number(r.sumCents ?? 0);
    count += r.n;
    totalCents += cents;
    // Only fold known spheres into a bucket; a stray/unknown sphere value
    // would still be counted in totalCents/count but has no chip.
    if (r.sphere && (SPHERES as readonly string[]).includes(r.sphere)) {
      bySphere[r.sphere as Sphere] += cents;
    }
  }
  return { totalCents, count, bySphere };
}

/**
 * Aggregate Einnahmen KPIs for the Einnahmen tab header.
 *
 * @param year  YearScope. A concrete year filters on `yearOfBuchung`;
 *              `ALL_YEARS` omits the year predicate (aggregate across all
 *              years). Mirrors the dashboard, which scopes income by
 *              `yearOfBuchung` (ADR-0001 Buchhaltungsjahr).
 *
 * One grouped query over `income` (sphere_snapshot → sum + count), excluding
 * superseded rows. The four-key `bySphere` fold guarantees every sphere is
 * present (0 when empty), `totalCents` = Σ buckets, `count` = Σ group counts.
 */
export async function listEinnahmenKpi(year: YearScope): Promise<EinnahmenKpi> {
  const db = getDb();

  // ALL_YEARS → no year predicate; concrete year → filter yearOfBuchung.
  const yearPredicate =
    year === ALL_YEARS ? undefined : eq(income.yearOfBuchung, year);

  // Exclude the superseded (Storno-chained) rows — they are not live income.
  const livePredicate = isNull(income.supersedesId);

  const where = yearPredicate
    ? and(yearPredicate, livePredicate)
    : livePredicate;

  const rows = await db
    .select({
      sphere: income.sphereSnapshot,
      sumCents: sum(income.betragCents),
      n: count(),
    })
    .from(income)
    .where(where)
    .groupBy(income.sphereSnapshot);

  return foldSphereBuckets(rows);
}
