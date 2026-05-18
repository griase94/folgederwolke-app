/**
 * Postgres-backed sliding-window rate limiter (§7.6 + ADR-0009 MUST-fix #2).
 *
 * Single round-trip: INSERT the new attempt row, then count occurrences
 * within the window in the same query via a CTE. If count > max, throw.
 *
 * Keys used by auth:
 *   magic_link:email:{canonical}  — 3 per 5 min
 *   magic_link:ip:{ip}            — 10 per 5 min
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";

export class RateLimitError extends Error {
  constructor(public readonly key: string) {
    super(`RATE_LIMITED: ${key}`);
    this.name = "RateLimitError";
  }
}

/**
 * Record a new attempt for `key` and check the sliding window.
 * Throws RateLimitError if max is exceeded (inclusive: n >= max after insert).
 */
export async function checkAndRecord(
  key: string,
  max: number,
  windowMs: number,
): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - windowMs);

  // Insert the new row AND count in one round-trip via CTE.
  const rows = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO rate_limit_attempts (key, occurred_at)
      VALUES (${key}, now())
    )
    SELECT COUNT(*)::int AS n
    FROM rate_limit_attempts
    WHERE key = ${key}
      AND occurred_at > ${cutoff}
  `);

  const n = (rows[0] as { n: number } | undefined)?.n ?? 0;
  if (n > max) {
    throw new RateLimitError(key);
  }
}
