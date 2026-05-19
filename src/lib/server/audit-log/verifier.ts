/**
 * Audit-log hash-chain verifier (ADR-0004, Phase 7.5 + post-review hardening).
 *
 * Walks `audit_log` rows in chain order (chain_seq ASC, skipping pre-genesis
 * NULLs) and recomputes each row's `row_hash` using the SAME recipe as the
 * SQL trigger (see `chain.ts` for the recipe documentation). Reports any
 * row where:
 *   - prev_hash != previous row's row_hash, OR
 *   - the recomputed row_hash != stored row_hash.
 *
 * Also detects suffix-truncation by cross-checking the in-table head against
 * the persisted `settings.audit_chain_last_head` row (audit-chain CRIT-04).
 *
 * Implementation note: rather than re-implement Postgres' jsonb canonical
 * text form in JavaScript, we let Postgres canonicalize the payload via
 * `payload::text` in the SELECT itself. v1 used `jsonb_strip_nulls` —
 * removed in v2 because it hides field deletions from the hash.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  computeRowHash,
  formatOccurredAtForHash,
  NULL_MARKER,
} from "./chain.js";
import { createHash } from "node:crypto";

export interface ChainBreak {
  /** Position of the broken row within the chain (chain_seq value). */
  chainSeq: number;
  /** UUID of the offending row. */
  rowId: string;
  /** What kind of break — link mismatch, hash mismatch, or table-suffix truncation. */
  kind:
    | "prev_hash_mismatch"
    | "row_hash_mismatch"
    | "table_head_below_persisted";
  /** Stored value as found in the DB. */
  stored: string | null;
  /** Value we expected based on recomputation. */
  expected: string;
}

export interface VerifyResult {
  ok: boolean;
  rowsChecked: number;
  preGenesisSkipped: number;
  breaks: ChainBreak[];
  /** The highest chain_seq seen in the table. */
  head: number | null;
  /** The persisted head from settings.audit_chain_last_head (truncation guard). */
  persistedHead: number | null;
}

interface ChainRow extends Record<string, unknown> {
  id: string;
  chain_seq: number;
  prev_hash: string | null;
  row_hash: string | null;
  actor_user_id: string | null;
  actor_kind: string | null;
  actor_ip_prefix: string | null;
  actor_ua_hash: string | null;
  action: string;
  entity_kind: string;
  entity_id: string | null;
  entity_business_id: string | null;
  occurred_at: Date;
  /** Already canonicalized by Postgres via payload::text. */
  payload_canonical: string;
}

interface PersistedHead extends Record<string, unknown> {
  chain_seq: number | null;
}

/**
 * Walk the audit-log chain. Returns an exhaustive list of breaks (does not
 * short-circuit on the first failure).
 *
 * Performance note: this is a single sequential scan ordered by chain_seq.
 * For chains up to a few million rows this is fast; for tens of millions a
 * resumable cursor-based walker would be needed (out of scope).
 */
export async function verifyAuditChain(): Promise<VerifyResult> {
  const db = getDb();

  // Pre-genesis count (for the report, not the walk).
  const preGenesisRows = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM audit_log WHERE chain_seq IS NULL`,
  );
  const preGenesisSkipped = preGenesisRows[0]?.n ?? 0;

  // Persisted head (from the trigger). Used to detect suffix truncation:
  // an attacker who removes the last N rows from audit_log can't update
  // this row without also INSERTing new audit rows (which would update
  // it via the trigger again).
  const persistedRows = await db.execute<PersistedHead>(sql`
    SELECT (value->>'chain_seq')::int AS chain_seq
      FROM settings
     WHERE key = 'audit_chain_last_head'
  `);
  const persistedHead = persistedRows[0]?.chain_seq ?? null;

  // Chain walk — Postgres formats the payload for us via `::text`.
  const rows = (await db.execute<ChainRow>(sql`
    SELECT
      id::text             AS id,
      chain_seq            AS chain_seq,
      prev_hash            AS prev_hash,
      row_hash             AS row_hash,
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
    WHERE chain_seq IS NOT NULL
    ORDER BY chain_seq ASC
  `)) as unknown as ChainRow[];

  const breaks: ChainBreak[] = [];
  let lastRowHash = "";

  for (const r of rows) {
    // 1. prev_hash linkage check
    const expectedPrev = lastRowHash;
    const storedPrev = r.prev_hash ?? "";
    if (storedPrev !== expectedPrev) {
      breaks.push({
        chainSeq: r.chain_seq,
        rowId: r.id,
        kind: "prev_hash_mismatch",
        stored: r.prev_hash,
        expected: expectedPrev,
      });
    }

    // 2. row_hash recomputation
    const expectedRow = computeRowHashFromDbRow(r, storedPrev);
    if ((r.row_hash ?? "") !== expectedRow) {
      breaks.push({
        chainSeq: r.chain_seq,
        rowId: r.id,
        kind: "row_hash_mismatch",
        stored: r.row_hash,
        expected: expectedRow,
      });
    }

    lastRowHash = r.row_hash ?? "";
  }

  const tableHead =
    rows.length > 0 ? (rows[rows.length - 1]?.chain_seq ?? null) : null;

  // 3. Table head vs persisted head — truncation detection.
  if (persistedHead !== null && persistedHead > 0) {
    if (tableHead === null || tableHead < persistedHead) {
      breaks.push({
        chainSeq: persistedHead,
        rowId: "(missing)",
        kind: "table_head_below_persisted",
        stored: tableHead === null ? null : String(tableHead),
        expected: String(persistedHead),
      });
    }
  }

  return {
    ok: breaks.length === 0,
    rowsChecked: rows.length,
    preGenesisSkipped,
    breaks,
    head: tableHead,
    persistedHead,
  };
}

/**
 * Recompute `row_hash` for a single DB row using the canonical payload string
 * we got back from Postgres. Mirrors the trigger and `chain.ts` recipe v2.
 */
function computeRowHashFromDbRow(r: ChainRow, prevHash: string): string {
  const parts = [
    prevHash,
    r.id,
    String(r.chain_seq),
    r.actor_user_id ?? NULL_MARKER,
    r.actor_kind ?? NULL_MARKER,
    r.actor_ip_prefix ?? NULL_MARKER,
    r.actor_ua_hash ?? NULL_MARKER,
    r.action,
    r.entity_kind,
    r.entity_id ?? NULL_MARKER,
    r.entity_business_id ?? NULL_MARKER,
    formatOccurredAtForHash(r.occurred_at),
    r.payload_canonical,
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * Convenience wrapper that hashes a synthetic input the same way the trigger
 * does (used by chain.test.ts). Re-exported so tests don't have to import the
 * private helper.
 */
export const _computeRowHash = computeRowHash;
