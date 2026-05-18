# ADR-0004: Audit log tamper-evidence

**Status:** Accepted (Phase 1: columns only; Phase 7.5: trigger + REVOKE + verifier)

## Context

GoBD § 146 requires that booking changes are traceable; § 257 AO requires
10-year retention; the Round-1 reviewer asked for cryptographic
tamper-evidence, not just "we have an audit table".

## Decision

`audit_log` is append-only with a hash chain:

- `chain_seq int` — global insertion sequence within the chain.
- `prev_hash text` — hash of the prior row.
- `row_hash text` — `sha256(prev_hash || canonical_json(row_without_hash))`.

Phase 7.5 work (not Phase 1):

1. Trigger uses `pg_advisory_xact_lock(hashtext('audit_log_chain'))` to
   serialize inserts and read the latest `prev_hash` consistently.
2. `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;` so the
   runtime role can only INSERT.
3. Nightly verifier cron walks the chain end-to-end; failure pages Andy via
   PushNotification.
4. Weekly export of audit_log + its hash chain to (a) Drive backup folder and
   (b) a private GitHub repo Andy controls — external anchoring is the actual
   tamper-evidence (an attacker with PG access can't rewrite history at the
   anchor without also compromising those two locations).
5. Chain genesis recorded at `settings.audit_chain_genesis_at` (seeded in
   Phase 1's seed.ts).

## Phase 1 deliverables (what's in this PR)

- `audit_log` table with `chain_seq`, `prev_hash`, `row_hash` columns (nullable
  — trigger fills them).
- `settings.audit_chain_genesis_at` seeded.
- `entity_kind` + `audit_action` enums defined.
- No trigger, no REVOKE. Phase 7.5 adds both.

## Why pre-genesis rows are allowed

Phase 0-7 development needs to write audit rows for testing. Phase 7.5's
backfill cron sets `chain_seq` / `prev_hash` / `row_hash` for pre-genesis
rows on first activation; from then on the trigger maintains the chain.
