#!/usr/bin/env bash
# restore-smoke.sh — Fixture-based pg_restore smoke test.
#
# Runs in CI (backup-restore-smoke job in ci.yml) to verify that:
#   1. pg_dump produces a valid custom-format dump
#   2. pg_restore can load it into a scratch database
#   3. At least one critical table (expenses) is present and readable
#
# Does NOT require a live Neon connection — uses a self-contained fixture dump
# created from scripts/seed-fixtures.ts data. Safe to run on every CI push.
#
# Usage:
#   ./scripts/restore-smoke.sh               # runs smoke test
#   SKIP_RESTORE_SMOKE=true ./scripts/...    # no-op (used when pg not available)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DUMP="${SCRIPT_DIR}/../tests/fixtures/smoke-restore.dump"
SCRATCH_DB="folgederwolke_smoke_$$"

log() { echo "[restore-smoke] $*"; }
die() { echo "[restore-smoke] ERROR: $*" >&2; exit 1; }

# ── 0. Skip guard ────────────────────────────────────────────────────────────
if [[ "${SKIP_RESTORE_SMOKE:-}" == "true" ]]; then
  log "SKIP_RESTORE_SMOKE=true — skipping"
  exit 0
fi

# ── 1. Check prerequisites ───────────────────────────────────────────────────
command -v psql    >/dev/null 2>&1 || die "psql not found — install postgresql-client"
command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found"
command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found"

# ── 2. Ensure fixture dump exists; create it if missing ──────────────────────
FIXTURE_DIR="$(dirname "${FIXTURE_DUMP}")"
mkdir -p "${FIXTURE_DIR}"

if [[ ! -f "${FIXTURE_DUMP}" ]]; then
  log "Fixture dump not found — creating minimal fixture..."

  # Stand up a temporary local Postgres (requires pg installed locally or in CI)
  # In CI this runs after the PostgreSQL service container is available.
  FIXTURE_DB="folgederwolke_fixture_$$"

  # Use PGHOST/PGPORT/PGUSER from environment if set (CI service container),
  # otherwise fall back to local socket defaults.
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-postgres}"

  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "CREATE DATABASE ${FIXTURE_DB};" postgres

  # Apply minimal schema (just enough for smoke test — expenses table + enums)
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${FIXTURE_DB}" <<'FIXTURE_SQL'
CREATE TYPE sphere AS ENUM ('ideeller','vermoegen','zweckbetrieb','wirtschaftlich');
CREATE TYPE status AS ENUM ('zu_pruefen','in_pruefung','geprueft','abgelehnt','importiert','erstattet');
CREATE TYPE source_kind AS ENUM ('app','form','sheet_import','fixture');
CREATE TYPE bezahlt_von_kind AS ENUM ('verein','member','extern');

CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     TEXT NOT NULL UNIQUE,
  betrag_cents    BIGINT NOT NULL,
  bezeichnung     TEXT NOT NULL,
  sphere_snapshot sphere NOT NULL,
  kategorie_name_snapshot TEXT NOT NULL,
  bezahlt_von_kind bezahlt_von_kind NOT NULL,
  bezahlt_von_display TEXT NOT NULL,
  status          status NOT NULL DEFAULT 'zu_pruefen',
  source          source_kind NOT NULL DEFAULT 'fixture',
  gebucht_am      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO expenses (business_id, betrag_cents, bezeichnung, sphere_snapshot,
  kategorie_name_snapshot, bezahlt_von_kind, bezahlt_von_display)
VALUES
  ('SMOKE-0001', 1250, 'Smoke test expense 1', 'ideeller', 'Sonstiges', 'verein', 'Verein'),
  ('SMOKE-0002', 4200, 'Smoke test expense 2', 'zweckbetrieb', 'Büro', 'member', 'Test Mitglied');
FIXTURE_SQL

  pg_dump \
    -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" \
    --format=custom \
    --no-owner \
    --no-acl \
    "${FIXTURE_DB}" \
    --file="${FIXTURE_DUMP}"

  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "DROP DATABASE ${FIXTURE_DB};" postgres
  log "Fixture dump created: ${FIXTURE_DUMP}"
fi

# ── 3. Create scratch database ───────────────────────────────────────────────
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"

log "Creating scratch database: ${SCRATCH_DB}"
psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "CREATE DATABASE ${SCRATCH_DB};" postgres

cleanup() {
  log "Dropping scratch database: ${SCRATCH_DB}"
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" postgres 2>/dev/null || true
}
trap cleanup EXIT

# ── 4. Restore ───────────────────────────────────────────────────────────────
log "Running pg_restore..."
pg_restore \
  -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  -d "${SCRATCH_DB}" \
  "${FIXTURE_DUMP}"

# ── 5. Smoke assertions ──────────────────────────────────────────────────────
log "Verifying restored data..."

ROW_COUNT=$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${SCRATCH_DB}" \
  -t -c "SELECT COUNT(*) FROM expenses;" | tr -d '[:space:]')

if [[ "${ROW_COUNT}" -lt 1 ]]; then
  die "Expected at least 1 row in expenses after restore, got ${ROW_COUNT}"
fi

BUSINESS_ID=$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${SCRATCH_DB}" \
  -t -c "SELECT business_id FROM expenses ORDER BY created_at LIMIT 1;" | tr -d '[:space:]')

if [[ -z "${BUSINESS_ID}" ]]; then
  die "Could not read business_id from restored expenses table"
fi

log "Smoke restore PASSED — ${ROW_COUNT} expense row(s) restored, first business_id: ${BUSINESS_ID}"
exit 0
