/**
 * Year-row materializer — idempotent creation of member_beitrags rows.
 *
 * Creates one row per active member for the given calendar year, reading
 * the Beitragssatz (cents) from beitragssatz_by_year. Idempotent via
 * ON CONFLICT DO NOTHING against the existing UNIQUE(member_id, year) index.
 *
 * **Why fetch-then-values instead of INSERT … SELECT:**
 * The `member_beitrags.betrag_eur` column is GENERATED ALWAYS AS (cents/100).
 * Drizzle's insert-select form cannot exclude generated columns from the
 * projection — the INSERT would fail. Additionally, `.onConflictDoNothing()`
 * on a `.insert().select()` chain gives no usable rowCount. Using explicit
 * `.values()` + `.returning()` avoids both issues (plan P0-A4, P0-B2).
 *
 * ADR-0003: betragCents stored as bigint cents.
 * ADR-0010: source = 'app' on all app-created rows.
 */

import { and, eq, gte, lte, or, isNull, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";

/**
 * Materializes `member_beitrags` rows for all active members for `year`.
 *
 * "Active during the year" means:
 *   - eintrittsDatum IS NULL OR eintrittsDatum <= Dec 31 of the year
 *   - austrittsDatum IS NULL OR austrittsDatum >= Jan 1 of the year
 *
 * Returns the number of newly created rows (0 if all rows already existed).
 *
 * Throws if `beitragssatz_by_year` has no row for the requested year.
 */
export async function materializeYearRows(year: number): Promise<number> {
  const db = getDb();

  // 1. Fetch the year's Beitragssatz — throws if missing
  const [satz] = await db
    .select({ cents: beitragssatzByYear.cents })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year))
    .limit(1);

  if (!satz) {
    throw new Error(`No Beitragssatz for year ${year}`);
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // 2. Fetch eligible members (active at any point during the year).
  //    A member is eligible if they joined on or before year-end
  //    AND they either haven't left or left on/after year-start.
  const eligibleMembers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        // Must have joined on or before Dec 31 of the year (or no join date)
        or(
          isNull(members.eintrittsDatum),
          lte(members.eintrittsDatum, sql<string>`${yearEnd}::date`),
        ),
        // Must not have left before Jan 1 of the year (or no leave date)
        or(
          isNull(members.austrittsDatum),
          gte(members.austrittsDatum, sql<string>`${yearStart}::date`),
        ),
      ),
    );

  if (eligibleMembers.length === 0) return 0;

  // 3. Insert with explicit whitelist — Drizzle skips `betrag_eur` because
  //    it's declared as generatedAlwaysAs in the schema.
  //    ON CONFLICT DO NOTHING + RETURNING gives an accurate count of new rows.
  const inserted = await db
    .insert(memberBeitrags)
    .values(
      eligibleMembers.map((m) => ({
        memberId: m.id,
        year,
        betragCents: satz.cents,
        paidCents: 0n,
        source: "app" as const,
      })),
    )
    .onConflictDoNothing({
      target: [memberBeitrags.memberId, memberBeitrags.year],
    })
    .returning({ id: memberBeitrags.id });

  return inserted.length;
}
