#!/usr/bin/env bash
# Grants LOGIN + password to app_runtime and app_export against the local
# Postgres. Used by both dev-up.sh and reset-test-db.sh.
#
# Why this isn't a migration: drizzle/0002_roles.sql creates the roles as
# NOLOGIN (Neon-friendly — Neon manages role auth itself). Local dev needs
# LOGIN + password to match .env.development / .env.test connection strings.

set -euo pipefail

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL must be set}"

# Safety: refuse if not localhost
case "$DIRECT_DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "grant-local-login: refusing — DIRECT_DATABASE_URL is not localhost: $DIRECT_DATABASE_URL" >&2
    exit 1
    ;;
esac

ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"

psql "$ADMIN_URL" -c "ALTER ROLE app_runtime WITH LOGIN PASSWORD 'app_runtime';" >/dev/null
psql "$ADMIN_URL" -c "ALTER ROLE app_export  WITH LOGIN PASSWORD 'app_export';"  >/dev/null
