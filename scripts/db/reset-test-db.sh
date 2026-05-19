#!/usr/bin/env bash
# Drop + recreate folgederwolke_test, apply migrations, seed reference + fixtures.
# Idempotent. Refuses to run unless DIRECT_DATABASE_URL points at localhost.

set -euo pipefail

# Load .env.test (all values are quoted so plain source works)
set -a
source .env.test
[[ -f .env.test.local ]] && source .env.test.local
set +a

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL missing from .env.test}"

# Safety: refuse if not localhost
case "$DIRECT_DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "reset-test-db: refusing — DIRECT_DATABASE_URL is not localhost: $DIRECT_DATABASE_URL" >&2
    exit 1
    ;;
esac

ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"

# ALLOW_CONNECTIONS false will fail if DB doesn't exist yet — tolerate that
psql "$ADMIN_URL" -c "ALTER DATABASE folgederwolke_test WITH ALLOW_CONNECTIONS false;" 2>/dev/null || true
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS folgederwolke_test WITH (FORCE);"
psql "$ADMIN_URL" -c "CREATE DATABASE folgederwolke_test;"

# Migrate and seed against the new test DB (env already points at folgederwolke_test)
pnpm tsx scripts/migrate.ts
pnpm tsx scripts/seed.ts

# Ensure app_runtime / app_export LOGIN — shared with dev-up.sh, since
# 0002_roles creates NOLOGIN roles
bash scripts/db/grant-local-login.sh

# Wipe the test file-storage tree so tests start with no leftover files
rm -rf ./.dev-data/drive-test
mkdir -p ./.dev-data/drive-test

echo "reset-test-db: done."
