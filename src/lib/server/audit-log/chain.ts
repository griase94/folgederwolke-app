/**
 * Audit log hash-chain v2 — TypeScript reference of the SQL trigger logic.
 *
 * The authoritative implementation lives in
 * `drizzle/0010_post_review_hardening.sql` (PL/pgSQL trigger
 * `audit_log_chain_trg`). This file documents and exports the *exact* hash
 * recipe used by the trigger so that:
 *
 *   1. The verifier (verifier.ts) can recompute `row_hash` per row and
 *      assert it matches what the DB stored.
 *   2. The backfill script (scripts/backfill-audit-chain.ts) can populate
 *      pre-genesis rows with the same recipe.
 *   3. Anyone reviewing tamper-evidence guarantees can read the algorithm
 *      in TypeScript without parsing PL/pgSQL.
 *
 * Recipe v2 (post-2026-05-19 review). Replaces v1 in 0009; the differences
 * are documented inline below. v1 is preserved as a comment in the migration
 * file for archaeology, but no production deployment runs it.
 *
 *     row_hash = sha256(
 *       prev_hash   || '|' ||   -- '' on chain_seq = 1
 *       id          || '|' ||   -- v2: id is now hashed (CRIT-01)
 *       chain_seq   || '|' ||   -- v2: hashed as text
 *       actor_user_id            || '|' ||   -- '\N' if NULL
 *       actor_kind               || '|' ||   -- v2: hashed (CRIT-01)
 *       actor_ip_prefix          || '|' ||   -- v2: hashed (CRIT-01)
 *       actor_ua_hash            || '|' ||   -- v2: hashed (CRIT-01)
 *       action                   || '|' ||
 *       entity_kind              || '|' ||
 *       entity_id                || '|' ||   -- '\N' if NULL
 *       entity_business_id       || '|' ||   -- v2: hashed (CRIT-01)
 *       occurred_at_ms           || '|' ||   -- v2: ms precision, not μs (CRIT-F1)
 *       payload_text                          -- v2: NO jsonb_strip_nulls (HIGH-04)
 *     )
 *
 * Field-separator: `|`. NULLs are serialized as the literal string `\N`
 * (Postgres convention). The hex-encoded sha256 digest is stored in row_hash.
 *
 * Serialization invariant: the trigger acquires
 * `pg_advisory_xact_lock(4711, 1)` BEFORE reading the chain head (v2:
 * namespaced two-arg form so the lock cannot collide with the id-allocator
 * or future advisory locks — schema CRIT-F2, audit-chain HIGH-01).
 */

import { createHash } from "node:crypto";

/** Postgres NULL serialization marker — matches `coalesce(x::text, '\\N')`. */
export const NULL_MARKER = "\\N";

/** Reserved advisory-lock namespace for the audit-log chain. */
export const ADVISORY_LOCK_NAMESPACE = 4711 as const;

/** Reserved advisory-lock key within the namespace. */
export const ADVISORY_LOCK_KEY = 1 as const;

export interface ChainInputs {
  /** UUID — never null (it's the audit_log row PK). */
  id: string;
  /** Integer ≥ 1. */
  chainSeq: number;
  /** '' on chain_seq = 1, else the previous row's row_hash. */
  prevHash: string;
  actorUserId: string | null;
  actorKind: string | null;
  actorIpPrefix: string | null;
  actorUaHash: string | null;
  action: string;
  entityKind: string;
  entityId: string | null;
  entityBusinessId: string | null;
  /** Row's `occurred_at`. The trigger truncates to ms before formatting. */
  occurredAt: Date;
  /** jsonb payload as text, NOT stripped of null-valued keys. */
  payloadCanonical: string;
}

/**
 * Format a Date as the same UTC string the trigger produces via
 * `to_char(date_trunc('milliseconds', NEW.occurred_at) AT TIME ZONE 'UTC',
 *         'YYYY-MM-DD"T"HH24:MI:SS.MS')`.
 *
 * `MS` in Postgres' to_char vocabulary = 3-digit milliseconds (NOT
 * microseconds). The v1 trigger used `US` (6 digits) which never matched
 * JS Date's ms precision — schema review CRIT-F1.
 *
 * Example: 2026-05-19T03:14:15.926
 */
export function formatOccurredAtForHash(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}`;
}

/**
 * Compute the hex sha256 row_hash for a chain input. Mirrors the v2 PL/pgSQL
 * trigger byte-for-byte. Adding or reordering a part here MUST be matched in
 * `audit_log_chain_fn()` and a new migration.
 */
export function computeRowHash(input: ChainInputs): string {
  const parts = [
    input.prevHash,
    input.id,
    String(input.chainSeq),
    input.actorUserId ?? NULL_MARKER,
    input.actorKind ?? NULL_MARKER,
    input.actorIpPrefix ?? NULL_MARKER,
    input.actorUaHash ?? NULL_MARKER,
    input.action,
    input.entityKind,
    input.entityId ?? NULL_MARKER,
    input.entityBusinessId ?? NULL_MARKER,
    formatOccurredAtForHash(input.occurredAt),
    input.payloadCanonical,
  ];
  const concatenated = parts.join("|");
  return createHash("sha256").update(concatenated, "utf8").digest("hex");
}
