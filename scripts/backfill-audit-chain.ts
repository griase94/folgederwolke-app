/**
 * One-shot backfill: compute hash-chain fields for pre-genesis audit_log rows.
 *
 * Pre-genesis rows are those inserted BEFORE migration 0009 installed the
 * `audit_log_chain_trg` trigger. Their `chain_seq`, `prev_hash`, `row_hash`
 * are NULL. The verifier intentionally skips them, but for forensic
 * completeness we backfill them once with the same recipe the trigger uses.
 *
 * Why this is a script, not a migration:
 *   - Backfill cost (one sha256 + 1 UPDATE per row) can be many MB on a
 *     large table — better to run out-of-band so it doesn't block deploy.
 *   - We must acquire the `audit_log_chain` advisory lock for the entire
 *     run to keep new trigger-driven inserts from interleaving and creating
 *     a fork in the chain.
 *
 * Usage:  tsx scripts/backfill-audit-chain.ts
 * Env:    DIRECT_DATABASE_URL (NOT the pooled URL — we hold a long lock).
 *
 * Idempotent: a second run is a no-op (only rows WHERE chain_seq IS NULL
 * are touched).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { createHash } from "node:crypto";
import {
  formatOccurredAtForHash,
  NULL_MARKER,
} from "../src/lib/server/audit-log/chain.js";

const url = process.env["DIRECT_DATABASE_URL"];
if (!url) {
  console.error("ERROR: DIRECT_DATABASE_URL is not set.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

interface Row {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_kind: string;
  entity_id: string | null;
  occurred_at: Date;
  payload_canonical: string;
}

async function main() {
  console.log("backfill-audit-chain: acquiring advisory lock …");
  // pg_advisory_lock (session-level) — held until disconnect or explicit
  // unlock. We disconnect at end of script so the lock auto-releases.
  await db.execute(sql`SELECT pg_advisory_lock(hashtext('audit_log_chain'))`);

  // Find chain head (could be NULL if NO rows ever passed through the trigger).
  const headRows = (await db.execute<{ chain_seq: number; row_hash: string }>(
    sql`SELECT chain_seq, row_hash FROM audit_log
        WHERE chain_seq IS NOT NULL
        ORDER BY chain_seq DESC LIMIT 1`,
  )) as unknown as { chain_seq: number; row_hash: string }[];

  let chainSeq = headRows[0]?.chain_seq ?? 0;
  let prevHash = headRows[0]?.row_hash ?? "";

  console.log(
    `backfill-audit-chain: starting from chain_seq=${chainSeq} (head=${prevHash.slice(0, 12)}…)`,
  );

  // Pre-genesis rows in insertion order (occurred_at ASC, id ASC as tiebreak).
  const rows = (await db.execute<Row>(sql`
    SELECT
      id::text             AS id,
      actor_user_id::text  AS actor_user_id,
      action::text         AS action,
      entity_kind::text    AS entity_kind,
      entity_id::text      AS entity_id,
      occurred_at          AS occurred_at,
      COALESCE(jsonb_strip_nulls(payload)::text, '{}') AS payload_canonical
    FROM audit_log
    WHERE chain_seq IS NULL
    ORDER BY occurred_at ASC, id ASC
  `)) as unknown as Row[];

  console.log(`backfill-audit-chain: ${rows.length} pre-genesis rows`);

  let updated = 0;
  for (const r of rows) {
    chainSeq += 1;
    const parts = [
      prevHash,
      r.actor_user_id ?? NULL_MARKER,
      r.action,
      r.entity_kind,
      r.entity_id ?? NULL_MARKER,
      formatOccurredAtForHash(r.occurred_at),
      r.payload_canonical,
    ];
    const rowHash = createHash("sha256")
      .update(parts.join("|"), "utf8")
      .digest("hex");

    await db.execute(sql`
      UPDATE audit_log
         SET chain_seq = ${chainSeq},
             prev_hash = ${prevHash},
             row_hash  = ${rowHash}
       WHERE id = ${r.id}::uuid
    `);

    prevHash = rowHash;
    updated += 1;
    if (updated % 500 === 0) console.log(`  … ${updated} rows backfilled`);
  }

  console.log(`backfill-audit-chain: done — ${updated} rows updated`);

  await db.execute(sql`SELECT pg_advisory_unlock(hashtext('audit_log_chain'))`);
}

try {
  await main();
} finally {
  await client.end();
}
