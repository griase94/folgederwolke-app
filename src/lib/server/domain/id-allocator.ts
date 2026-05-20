/**
 * Concurrent-safe business-ID allocator (ADR-0010).
 *
 * Uses pg_advisory_xact_lock(hashtext(...)) inside a transaction to serialize
 * allocations per (year, kind) shard — no SERIALIZABLE isolation needed,
 * no retry loops, zero gap sequences.
 *
 * Each call:
 *  1. Acquires advisory lock for (year, kind) — blocks concurrent callers.
 *  2. Upserts the id_counters row (INSERT … ON CONFLICT DO NOTHING).
 *  3. SELECT + UPDATE next_value atomically.
 *  4. Returns formatted business_id via formatBusinessId().
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { idCounters } from "$lib/server/db/schema/id_counters.js";
import { formatBusinessId } from "$lib/domain/business-id.js";
import type { BusinessIdPrefix } from "$lib/domain/business-id.js";
import { berlinYear } from "$lib/domain/year.js";

export type AllocatorKind = BusinessIdPrefix;

/**
 * Allocates the next business ID for the given prefix kind + year.
 *
 * @param kind  - One of the BusinessIdPrefix values: 'A'|'AUS'|'E'|'S'|'B'|'P'|'FDW'
 * @param year  - Buchhaltungsjahr (defaults to the current Berlin-local year
 *                per ADR-0001). Using UTC `getFullYear()` would mis-allocate
 *                IDs during the ~1h window at the year boundary when Berlin
 *                has rolled over but UTC has not (e.g. 23:30 UTC on Dec 31).
 * @returns     - Formatted business ID string e.g. "AUS-2026-007"
 */
export async function allocateBusinessId(
  kind: AllocatorKind,
  year: number = berlinYear(),
): Promise<string> {
  const db = getDb();

  const businessId = await db.transaction(async (tx) => {
    // 1. Acquire advisory lock scoped to this transaction for (year, kind).
    //    hashtext() maps the string key to a 32-bit int for pg_advisory_xact_lock.
    //    The lock is automatically released when the transaction ends.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`id_counter:${year}:${kind}`}))`,
    );

    // 2. Ensure the counter row exists (upsert with do-nothing on conflict).
    await tx
      .insert(idCounters)
      .values({ year, kind, nextValue: BigInt(1) })
      .onConflictDoNothing();

    // 3. Atomically bump next_value and return the old value (the one we claim).
    const rows = await tx.execute<{ claimed: string }>(
      sql`
        UPDATE id_counters
        SET next_value = next_value + 1,
            updated_at = NOW()
        WHERE year = ${year} AND kind = ${kind}
        RETURNING (next_value - 1)::text AS claimed
      `,
    );

    const claimedStr = (rows as { claimed: string }[])[0]?.claimed;
    if (!claimedStr) {
      throw new Error(
        `id-allocator: UPDATE returned no row for kind=${kind} year=${year}`,
      );
    }

    const seq = parseInt(claimedStr, 10);
    return formatBusinessId(kind, year, seq);
  });

  return businessId;
}
