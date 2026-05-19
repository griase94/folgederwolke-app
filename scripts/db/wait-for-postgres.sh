#!/usr/bin/env bash
# Wait for Postgres to accept queries on the admin DB.
# pg_isready alone false-positives on first volume init before init.sql
# finishes — we loop on a real `select 1` query.

set -euo pipefail

: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL must be set}"

ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"
timeout=30

while ! psql "$ADMIN_URL" -c 'select 1' >/dev/null 2>&1; do
  ((timeout--)) || { echo "wait-for-postgres: timed out after 30s" >&2; exit 1; }
  sleep 1
done

echo "wait-for-postgres: ready."
