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
 * Minimal Drizzle writer surface (client OR in-flight transaction handle).
 * `allocateBusinessIds` accepts one so a batch submit can claim its IDs on the
 * SAME transaction as its inserts — a rollback then also rolls back the counter
 * bump, so a failed batch burns NO gapless IDs. Mirrors logAudit's writer seam.
 */
type IdWriter = Pick<ReturnType<typeof getDb>, "execute" | "insert">;

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

/**
 * Allocates `count` consecutive business IDs for a batch submit in ONE
 * advisory-locked counter bump — the batch-Auslage analogue of
 * allocateBusinessId. Returns them in order, e.g.
 * ["AUS-2026-007", "AUS-2026-008", "AUS-2026-009"].
 *
 * @param writer  Optional in-flight transaction handle. Pass the `tx` from an
 *   enclosing `db.transaction()` so the counter bump participates in the same
 *   transaction as the row inserts: on rollback the counter also rolls back, so
 *   a failed batch burns no IDs. MUST be a real transaction handle — passing a
 *   bare client would auto-commit each statement and release the advisory lock
 *   before the UPDATE. Omit to run in a fresh self-contained transaction.
 */
export async function allocateBusinessIds(
  kind: AllocatorKind,
  count: number,
  year: number = berlinYear(),
  writer?: IdWriter,
): Promise<string[]> {
  if (count <= 0) return [];

  const run = async (tx: IdWriter): Promise<string[]> => {
    // 1. Serialize allocations for this (year, kind) shard (xact-scoped lock).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`id_counter:${year}:${kind}`}))`,
    );

    // 2. Ensure the counter row exists.
    await tx
      .insert(idCounters)
      .values({ year, kind, nextValue: BigInt(1) })
      .onConflictDoNothing();

    // 3. Claim a contiguous block of `count` values; return the block start.
    const rows = await tx.execute<{ start: string }>(
      sql`
        UPDATE id_counters
        SET next_value = next_value + ${count},
            updated_at = NOW()
        WHERE year = ${year} AND kind = ${kind}
        RETURNING (next_value - ${count})::text AS start
      `,
    );

    const startStr = (rows as { start: string }[])[0]?.start;
    if (!startStr) {
      throw new Error(
        `id-allocator: batch UPDATE returned no row for kind=${kind} year=${year}`,
      );
    }

    const start = parseInt(startStr, 10);
    return Array.from({ length: count }, (_, i) =>
      formatBusinessId(kind, year, start + i),
    );
  };

  if (writer) return run(writer);
  return getDb().transaction(run);
}
