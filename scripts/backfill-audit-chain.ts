/**
 * One-shot backfill: compute hash-chain fields for pre-genesis audit_log rows
 * using recipe v2 (post-2026-05-19 review). Idempotent: a second run is a
 * no-op (only rows WHERE chain_seq IS NULL are touched).
 *
 * v2 changes vs the original:
 *   - Tie-break by `id::uuid` ASC, not `occurred_at` ASC + `id` ASC. The
 *     id is server-generated (gen_random_uuid) and outside any attacker's
 *     control — audit-chain CRIT-05 flagged that occurred_at could be
 *     spoofed via direct DB write to reorder pre-genesis rows before the
 *     chain freezes them.
 *   - Two-arg namespaced advisory lock (4711, 1) — matches the trigger
 *     in migration 0010 (schema CRIT-F2).
 *   - Hash recipe v2 includes id, chain_seq, actor_kind, actor_ip_prefix,
 *     actor_ua_hash, entity_business_id (audit-chain CRIT-01).
 *   - Updates the persisted head pointer at the end (audit-chain CRIT-04).
 *
 * Usage:  pnpm tsx scripts/backfill-audit-chain.ts
 * Env:    DIRECT_DATABASE_URL (NOT the pooled URL — we hold a long lock).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import {
  ADVISORY_LOCK_KEY,
  ADVISORY_LOCK_NAMESPACE,
  computeRowHash,
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
  actor_kind: string | null;
  actor_ip_prefix: string | null;
  actor_ua_hash: string | null;
  action: string;
  entity_kind: string;
  entity_id: string | null;
  entity_business_id: string | null;
  occurred_at: Date;
  payload_canonical: string;
}

async function main() {
  console.log("backfill-audit-chain: acquiring advisory lock …");
  // Session-level lock so it survives statement-by-statement work below.
  // Released at end of script via pg_advisory_unlock + disconnect.
  await db.execute(
    sql`SELECT pg_advisory_lock(${ADVISORY_LOCK_NAMESPACE}, ${ADVISORY_LOCK_KEY})`,
  );

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

  // Pre-genesis rows sorted by their server-assigned UUID. We deliberately
  // do NOT use occurred_at as the sort key — see header comment + CRIT-05.
  const rows = (await db.execute<Row>(sql`
    SELECT
      id::text             AS id,
      actor_user_id::text  AS actor_user_id,
      actor_kind::text     AS actor_kind,
      actor_ip_prefix      AS actor_ip_prefix,
      actor_ua_hash        AS actor_ua_hash,
      action::text         AS action,
      entity_kind::text    AS entity_kind,
      entity_id::text      AS entity_id,
      entity_business_id   AS entity_business_id,
      occurred_at          AS occurred_at,
      COALESCE(payload::text, '{}') AS payload_canonical
    FROM audit_log
    WHERE chain_seq IS NULL
    ORDER BY id ASC
  `)) as unknown as Row[];

  console.log(`backfill-audit-chain: ${rows.length} pre-genesis rows`);

  let updated = 0;
  for (const r of rows) {
    chainSeq += 1;
    const rowHash = computeRowHash({
      id: r.id,
      chainSeq,
      prevHash,
      actorUserId: r.actor_user_id,
      actorKind: r.actor_kind,
      actorIpPrefix: r.actor_ip_prefix,
      actorUaHash: r.actor_ua_hash,
      action: r.action,
      entityKind: r.entity_kind,
      entityId: r.entity_id,
      entityBusinessId: r.entity_business_id,
      occurredAt: r.occurred_at,
      payloadCanonical: r.payload_canonical,
    });

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

  // Update the persisted head pointer so the verifier's truncation check
  // has something to compare against. (The trigger updates this on every
  // future INSERT; here we set it as part of the one-shot backfill.)
  if (updated > 0) {
    await db.execute(sql`
      UPDATE settings
         SET value = jsonb_build_object(
                       'chain_seq', ${chainSeq},
                       'row_hash',  ${prevHash},
                       'updated_at', to_char(now() AT TIME ZONE 'UTC',
                                             'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                     )
       WHERE key = 'audit_chain_last_head'
    `);
  }

  console.log(`backfill-audit-chain: done — ${updated} rows updated`);

  await db.execute(
    sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_NAMESPACE}, ${ADVISORY_LOCK_KEY})`,
  );
}

try {
  await main();
} finally {
  await client.end();
}
