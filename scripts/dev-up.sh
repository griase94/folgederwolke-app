#!/usr/bin/env bash
# Idempotent dev bootstrap:
#   1. starts docker compose
#   2. waits for Postgres to accept queries
#   3. applies migrations to folgederwolke_dev
#   4. sets app_runtime / app_export login + password (local-only — Neon manages its own roles)
#   5. seeds reference data + fixtures if dev DB is empty

set -euo pipefail

# Load env (.env.development uses quoted values so plain `source` works)
set -a
source .env.development
[[ -f .env.development.local ]] && source .env.development.local
set +a

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL missing from .env.development}"

# Safety: refuse if not localhost — prevents ALTER ROLE from hitting Neon
case "$DIRECT_DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "dev-up: refusing — DIRECT_DATABASE_URL is not localhost: $DIRECT_DATABASE_URL" >&2
    exit 1
    ;;
esac

# --- Compose up + wait ------------------------------------------------------
docker compose up -d postgres
./scripts/db/wait-for-postgres.sh

# --- Migrate ----------------------------------------------------------------
echo "[dev-up] applying migrations..."
pnpm tsx scripts/migrate.ts

# --- Grant app_runtime / app_export LOGIN + password (LOCAL ONLY) -----------
bash scripts/db/grant-local-login.sh

# --- Seed if dev DB is empty ------------------------------------------------
KAT_COUNT=$(psql "$DIRECT_DATABASE_URL" -t -A -c 'select count(*) from kategorien;')
if [[ "$KAT_COUNT" == "0" ]]; then
  echo "[dev-up] seeding reference data + fixtures..."
  pnpm tsx scripts/seed.ts
else
  echo "[dev-up] dev DB already seeded (kategorien=$KAT_COUNT) — skipping seed."
fi

echo "[dev-up] done."
