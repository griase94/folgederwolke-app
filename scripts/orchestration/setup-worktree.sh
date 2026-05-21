#!/usr/bin/env bash
# Pre-Flight Task 0.9 — per-slot worktree bootstrap
# Usage: setup-worktree.sh <cluster-slug> <slot>
#   <cluster-slug> e.g. b-1, c2-tax, c1-prj-a
#   <slot> 1..12 (one per parallel agent in Night 1)
set -euo pipefail

SLUG="${1:?usage: setup-worktree.sh <cluster-slug> <slot>}"
SLOT="${2:?usage: setup-worktree.sh <cluster-slug> <slot>}"

BRANCH="evening-2026-05-21-${SLUG}"
WORKTREE_PATH="../folgederwolke-app-${SLUG}"
WORKTREE_DB="folgederwolke_test_slot${SLOT}"
WORKTREE_PORT=$((4173 + SLOT))

if [ -d "$WORKTREE_PATH" ]; then
  echo "[setup-worktree] worktree already exists at $WORKTREE_PATH — skipping create"
else
  # Branch off origin/main (latest) — local main may be stale (other worktree)
  git fetch origin main --quiet
  git worktree add -b "$BRANCH" "$WORKTREE_PATH" origin/main
fi

cat > "$WORKTREE_PATH/.env.test.local" <<EOF
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:15432/$WORKTREE_DB
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:15432/$WORKTREE_DB
PORT=$WORKTREE_PORT
ORIGIN=http://127.0.0.1:$WORKTREE_PORT
BLOB_READ_WRITE_TOKEN=
STORAGE_BACKEND=local-fs
FILE_STORAGE_ROOT=./.dev-data/drive-test-slot${SLOT}
EOF

PGPASSWORD=postgres psql -h localhost -p 15432 -U postgres -c \
  "CREATE DATABASE $WORKTREE_DB OWNER postgres;" 2>/dev/null || true

echo "Worktree ready: $WORKTREE_PATH (port $WORKTREE_PORT, db $WORKTREE_DB)"
