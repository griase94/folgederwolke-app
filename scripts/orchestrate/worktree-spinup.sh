#!/usr/bin/env bash
# Spin up an isolated worktree for one cluster of the overnight run.
# Usage: scripts/orchestrate/worktree-spinup.sh <c1|c2|…|c9>
set -euo pipefail

PORT_BASE_POSTGRES=5440
PORT_BASE_VITE=5180

if [ $# -lt 1 ]; then
  echo "Usage: $0 <c1|c2|…|c9>" >&2
  exit 64
fi

CID="$1"
case "$CID" in
  c1) NAME="eur-redesign"   ;;
  c2) NAME="year-switcher"  ;;
  c3) NAME="dashboard"      ;;
  c4) NAME="sphere-bug"     ;;
  c5) NAME="pwa-icons"      ;;
  c6) NAME="primitives"     ;;
  c7) NAME="mobile-polish"  ;;
  c8) NAME="mail-templates" ;;
  c9) NAME="microcopy-ia"   ;;
  *) echo "Unknown cluster: $CID" >&2; exit 64 ;;
esac

OFFSET=${CID#c}
PG_PORT=$((PORT_BASE_POSTGRES + OFFSET))
VITE_PORT=$((PORT_BASE_VITE + OFFSET))
DB_NAME="folgederwolke_test_${CID}"
ROOT="$(git rev-parse --show-toplevel)"
WT="${ROOT}/.claude/worktrees/overnight-${CID}-${NAME}"
BRANCH="overnight-2026-05-20/${CID}-${NAME}"
COMPOSE_PROJECT="fdw-overnight-${CID}"
STORAGE_ROOT="${ROOT}/.dev-data/overnight/${CID}-drive"

mkdir -p "$(dirname "$WT")" "$STORAGE_ROOT"

if [ ! -d "$WT" ]; then
  git -C "$ROOT" worktree add -B "$BRANCH" "$WT" "overnight-2026-05-20"
fi

cat > "$WT/.env.test.local" <<EOF
# Auto-written by worktree-spinup.sh — DO NOT EDIT.
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:${PG_PORT}/${DB_NAME}
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:${PG_PORT}/${DB_NAME}
STORAGE_BACKEND=local-fs
FILE_STORAGE_ROOT=${STORAGE_ROOT}
MAIL_PROVIDER=no-op
MAIL_FROM=test-${CID}@folgederwolke.local
VITE_PORT=${VITE_PORT}
EOF

cat <<EOF
{
  "cluster": "${CID}",
  "name": "${NAME}",
  "worktree": "${WT}",
  "branch": "${BRANCH}",
  "postgres_port": ${PG_PORT},
  "vite_port": ${VITE_PORT},
  "db_name": "${DB_NAME}",
  "compose_project": "${COMPOSE_PROJECT}",
  "storage_root": "${STORAGE_ROOT}"
}
EOF
