#!/usr/bin/env bash
# Idempotent dev bootstrap:
#   1. starts docker compose
#   2. waits for Postgres to accept queries
#   3. applies migrations to folgederwolke_dev
#   4. sets app_runtime / app_export login + password (local-only — Neon manages its own roles)
#   5. seeds reference data + fixtures if dev DB is empty

set -euo pipefail

# --- Load env ---------------------------------------------------------------
# Parse .env files line-by-line to tolerate unquoted values with special chars
# (parens, commas, etc.) that would otherwise trip up `source`.
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    local key="${BASH_REMATCH[1]}"
    local val="${BASH_REMATCH[2]}"
    # Strip surrounding single or double quotes if present
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    export "$key=$val"
  done < "$file"
}

load_env_file .env.development
load_env_file .env.development.local

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL missing from .env.development}"

# --- Compose up + wait ------------------------------------------------------
docker compose up -d postgres
./scripts/db/wait-for-postgres.sh

# --- Migrate ----------------------------------------------------------------
echo "[dev-up] applying migrations..."
pnpm tsx scripts/migrate.ts

# --- Grant app_runtime / app_export LOGIN + password (LOCAL ONLY) -----------
# drizzle/0002_roles.sql creates these roles as NOLOGIN. Neon manages role
# auth itself — don't put this in a migration. Local dev needs LOGIN +
# password to match .env.development's DATABASE_URL connection string.
ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"
psql "$ADMIN_URL" -c "ALTER ROLE app_runtime WITH LOGIN PASSWORD 'app_runtime';" >/dev/null
psql "$ADMIN_URL" -c "ALTER ROLE app_export  WITH LOGIN PASSWORD 'app_export';"  >/dev/null

# --- Seed if dev DB is empty ------------------------------------------------
KAT_COUNT=$(psql "$DIRECT_DATABASE_URL" -t -A -c 'select count(*) from kategorien;')
if [[ "$KAT_COUNT" == "0" ]]; then
  echo "[dev-up] seeding reference data + fixtures..."
  pnpm tsx scripts/seed.ts
else
  echo "[dev-up] dev DB already seeded (kategorien=$KAT_COUNT) — skipping seed."
fi

echo "[dev-up] done."
