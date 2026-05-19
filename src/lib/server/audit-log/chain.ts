/**
 * Audit log hash-chain — TypeScript reference of the SQL trigger logic.
 *
 * The authoritative implementation lives in `drizzle/0009_audit_log_hardening.sql`
 * (PL/pgSQL trigger `audit_log_chain_trg`). This file documents and exports
 * the *exact* hash recipe used by the trigger so that:
 *
 *   1. The verifier (verifier.ts) can recompute `row_hash` per row and
 *      assert it matches what the DB stored.
 *   2. The backfill script (scripts/backfill-audit-chain.ts) can populate
 *      pre-genesis rows with the same recipe.
 *   3. Anyone reviewing tamper-evidence guarantees can read the algorithm
 *      in TypeScript without parsing PL/pgSQL.
 *
 * Recipe (ADR-0004):
 *
 *     row_hash = sha256(
 *       prev_hash   ||  -- '' for the very first row (chain_seq = 1)
 *       actor_user_id || '|' ||
 *       action || '|' ||
 *       entity_kind || '|' ||
 *       entity_id || '|' ||
 *       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z" AT TIME ZONE UTC') || '|' ||
 *       payload_canonical_json
 *     )
 *
 * - NULLs are serialized as the literal string `\N` (Postgres convention).
 * - `created_at` is the row's `occurred_at` (the trigger uses NEW.occurred_at).
 * - `payload_canonical_json` is `jsonb` cast to text via `jsonb::text` AFTER
 *   passing through `jsonb_strip_nulls` for stability.
 * - All field separators are single pipes ('|').
 *
 * The hex-encoded sha256 digest is stored in `row_hash` (text).
 *
 * Serialization invariant: the trigger acquires
 * `pg_advisory_xact_lock(hashtext('audit_log_chain'))` BEFORE reading the
 * latest `chain_seq` / `prev_hash`. This serializes concurrent inserts
 * within a transaction so the chain has a single linear order.
 */

import { createHash } from "node:crypto";

/** Postgres NULL serialization marker — matches `coalesce(x::text, '\\N')` in the trigger. */
export const NULL_MARKER = "\\N";

export interface ChainInputs {
  prevHash: string | null;
  actorUserId: string | null;
  action: string;
  entityKind: string;
  entityId: string | null;
  /** Row's `occurred_at` — the trigger uses NEW.occurred_at. */
  occurredAt: Date;
  /** Already-canonical jsonb payload (the trigger uses jsonb_strip_nulls + ::text). */
  payloadCanonical: string;
}

/**
 * Format a Date as the same UTC string the trigger produces via
 * `to_char(NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`.
 *
 * Example: 2026-05-19T03:14:15.926000
 */
export function formatOccurredAtForHash(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  // Postgres `US` = microseconds (6 digits). JS Date has ms-precision; pad with '000'.
  const us = pad(d.getUTCMilliseconds(), 3) + "000";
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${us}`;
}

/**
 * Compute the hex sha256 row_hash for a chain input. Mirrors the PL/pgSQL
 * trigger byte-for-byte.
 */
export function computeRowHash(input: ChainInputs): string {
  const parts = [
    input.prevHash ?? "",
    input.actorUserId ?? NULL_MARKER,
    input.action,
    input.entityKind,
    input.entityId ?? NULL_MARKER,
    formatOccurredAtForHash(input.occurredAt),
    input.payloadCanonical,
  ];
  const concatenated = parts.join("|");
  return createHash("sha256").update(concatenated, "utf8").digest("hex");
}
