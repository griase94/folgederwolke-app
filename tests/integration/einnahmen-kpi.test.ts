/**
 * Phase 5 / Task 1 — listEinnahmenKpi aggregation (Tier C2).
 *
 * Powers the Einnahmen list KPI anchor (Jahr · Summe · N) + the four
 * Sphären-Split chips (spec §8.1). One grouped query over `income`:
 * total + count + per-sphere bucket, scoped by `yearOfBuchung`, excluding
 * superseded rows (isNull(supersedesId)).
 *
 * DB-backed → RESET lane. This file seeds its OWN income rows (across all four
 * spheres, a superseded row, and a different-year row) so the assertions are
 * deterministic regardless of the showcase corpus. Skipped when
 * DATABASE_URL/DIRECT_DATABASE_URL unset.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import { listEinnahmenKpi } from "$lib/server/domain/einnahmen-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";
import { getDb } from "$lib/server/db/index.js";
import { income } from "$lib/server/db/schema/income.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import type { Sphere } from "$lib/domain/sphere.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// A dedicated test year far from the seeded corpus so our own rows are the
// only income in scope for the exact-sum assertions.
const TEST_YEAR = 2099;
const OTHER_YEAR = 2098;

// A Berlin-local date string whose Buchhaltungsjahr is `year` (mid-year noon
// avoids any TZ-boundary ambiguity for the generated year_of_buchung column).
function midYear(year: number): string {
  return `${year}-06-15T12:00:00.000Z`;
}

/** Resolve one seeded income kategorie per sphere so sphere_snapshot is valid. */
async function kategorieForSphere(sphere: Sphere): Promise<{
  id: string;
  name: string;
}> {
  const db = getDb();
  const [row] = await db
    .select({ id: kategorien.id, name: kategorien.name })
    .from(kategorien)
    .where(and(eq(kategorien.kind, "income"), eq(kategorien.sphere, sphere)))
    .limit(1);
  if (!row) throw new Error(`no income kategorie seeded for sphere ${sphere}`);
  return row;
}

describe.skipIf(!dbConfigured)("listEinnahmenKpi", () => {
  // Per-sphere amounts seeded in TEST_YEAR.
  const SEED = {
    ideeller: 800_00,
    vermoegen: 0, // intentionally seed NO row → bucket must still be 0
    zweckbetrieb: 300_00,
    wirtschaftlich: 150_00,
  };

  beforeAll(async () => {
    if (!dbConfigured) return;
    const db = getDb();

    // Clean any prior rows in our test years so re-runs are deterministic.
    await db.delete(income).where(eq(income.yearOfBuchung, TEST_YEAR));
    await db.delete(income).where(eq(income.yearOfBuchung, OTHER_YEAR));

    const seeds: { sphere: Sphere; cents: number; seq: number }[] = [
      { sphere: "ideeller", cents: SEED.ideeller, seq: 901 },
      { sphere: "zweckbetrieb", cents: SEED.zweckbetrieb, seq: 902 },
      { sphere: "wirtschaftlich", cents: SEED.wirtschaftlich, seq: 903 },
    ];

    for (const s of seeds) {
      const kat = await kategorieForSphere(s.sphere);
      await db.insert(income).values({
        businessId: `E-${TEST_YEAR}-${s.seq}`,
        bezeichnung: `KPI seed ${s.sphere}`,
        betragCents: BigInt(s.cents),
        gebuchtAm: new Date(midYear(TEST_YEAR)),
        kategorieId: kat.id,
        kategorieNameSnapshot: kat.name,
        sphereSnapshot: s.sphere,
      });
    }

    // A SUPERSEDED row in TEST_YEAR (ideeller) — must be EXCLUDED from the
    // totals/count/buckets. We point supersedesId at one of the live rows.
    const liveIdeeller = await db
      .select({ id: income.id })
      .from(income)
      .where(
        and(
          eq(income.yearOfBuchung, TEST_YEAR),
          eq(income.sphereSnapshot, "ideeller"),
        ),
      )
      .limit(1);
    const supersedeTargetId = liveIdeeller[0]?.id ?? null;
    const katIdeeller = await kategorieForSphere("ideeller");
    await db.insert(income).values({
      businessId: `E-${TEST_YEAR}-904`,
      bezeichnung: "KPI seed SUPERSEDED (must be excluded)",
      betragCents: BigInt(999_99),
      gebuchtAm: new Date(midYear(TEST_YEAR)),
      kategorieId: katIdeeller.id,
      kategorieNameSnapshot: katIdeeller.name,
      sphereSnapshot: "ideeller",
      supersedesId: supersedeTargetId,
    });

    // A row in a DIFFERENT year — must NOT leak into the TEST_YEAR scope.
    const katWirtschaftlich = await kategorieForSphere("wirtschaftlich");
    await db.insert(income).values({
      businessId: `E-${OTHER_YEAR}-901`,
      bezeichnung: "KPI seed other year (must be excluded from TEST_YEAR)",
      betragCents: BigInt(500_00),
      gebuchtAm: new Date(midYear(OTHER_YEAR)),
      kategorieId: katWirtschaftlich.id,
      kategorieNameSnapshot: katWirtschaftlich.name,
      sphereSnapshot: "wirtschaftlich",
    });
  });

  it("returns total sum + count + per-sphere split buckets", async () => {
    const kpi = await listEinnahmenKpi(TEST_YEAR);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    // four named sphere buckets, each a cents integer (0 when empty)
    expect(typeof kpi.bySphere.ideeller).toBe("number");
    expect(typeof kpi.bySphere.vermoegen).toBe("number");
    expect(typeof kpi.bySphere.zweckbetrieb).toBe("number");
    expect(typeof kpi.bySphere.wirtschaftlich).toBe("number");

    // Exact buckets (only our three live rows are in TEST_YEAR scope).
    expect(kpi.bySphere.ideeller).toBe(SEED.ideeller);
    expect(kpi.bySphere.vermoegen).toBe(0); // empty sphere → present as 0
    expect(kpi.bySphere.zweckbetrieb).toBe(SEED.zweckbetrieb);
    expect(kpi.bySphere.wirtschaftlich).toBe(SEED.wirtschaftlich);

    // the buckets sum to the total (cents-exact)
    const sum =
      kpi.bySphere.ideeller +
      kpi.bySphere.vermoegen +
      kpi.bySphere.zweckbetrieb +
      kpi.bySphere.wirtschaftlich;
    expect(sum).toBe(kpi.totalCents);
    expect(kpi.totalCents).toBe(
      SEED.ideeller + SEED.zweckbetrieb + SEED.wirtschaftlich,
    );
    // three live rows (the superseded + other-year ones are excluded).
    expect(kpi.count).toBe(3);
  });

  it("excludes superseded rows (isNull(supersedesId))", async () => {
    // The seeded superseded row carries 999_99 cents in TEST_YEAR; if it were
    // counted the total would jump and count would be 4. The exact assertions
    // above already prove exclusion — re-assert the count + that no bucket
    // reflects the superseded amount.
    const kpi = await listEinnahmenKpi(TEST_YEAR);
    expect(kpi.count).toBe(3);
    expect(kpi.totalCents).not.toBe(
      SEED.ideeller + SEED.zweckbetrieb + SEED.wirtschaftlich + 999_99,
    );

    // Sanity: there really IS a superseded row in TEST_YEAR (proves the
    // exclusion is doing work, not vacuously passing on an empty set).
    const db = getDb();
    const superseded = await db
      .select({ id: income.id })
      .from(income)
      .where(
        and(
          eq(income.yearOfBuchung, TEST_YEAR),
          isNotNull(income.supersedesId),
        ),
      );
    expect(superseded.length).toBeGreaterThanOrEqual(1);
  });

  it("supports ALL_YEARS (omits the year predicate)", async () => {
    const all = await listEinnahmenKpi(ALL_YEARS);
    expect(all.count).toBeGreaterThanOrEqual(0);
    // ALL_YEARS aggregates across every year, so it includes the OTHER_YEAR
    // row + the corpus → its total/count dominate the single-year scope.
    const scoped = await listEinnahmenKpi(TEST_YEAR);
    expect(all.totalCents).toBeGreaterThanOrEqual(scoped.totalCents);
    expect(all.count).toBeGreaterThanOrEqual(scoped.count);
    // the four buckets are always present
    expect(typeof all.bySphere.ideeller).toBe("number");
    expect(typeof all.bySphere.vermoegen).toBe("number");
    expect(typeof all.bySphere.zweckbetrieb).toBe("number");
    expect(typeof all.bySphere.wirtschaftlich).toBe("number");
  });
});
