#!/usr/bin/env bash
set -euo pipefail

# cleanup.sh — Emergency rollback and orphan cleanup
# Documented in docs/RUNBOOK.md under "Emergency Stop"
#
# Usage: scripts/orchestration/cleanup.sh [phase-number]
#   Reverts to last phase-N-green tag, drops uncommitted migrations,
#   closes orphaned PRs, deletes preview deploys.
#
# Exit codes:
#   0 — cleanup complete
#   1 — fatal: no phase-N-green tag found

# ABORT sentinel check
[ -f ~/.folgederwolke-build/state/ABORT ] && { echo "STOP user_abort"; exit 1; }

PHASE="${1:-}"
echo "=== cleanup.sh start$([ -n "$PHASE" ] && echo " phase=$PHASE" || echo "") ==="

# 1. Revert to last phase-N-green tag
LAST_GREEN_TAG=$(git tag --list 'phase-*-green' --sort=-version:refname | head -1)
if [ -z "$LAST_GREEN_TAG" ]; then
  echo "ERROR: no phase-*-green tag found — cannot revert safely"
  exit 1
fi
echo "Reverting to $LAST_GREEN_TAG ..."
git checkout main
git reset --hard "$LAST_GREEN_TAG"

# 2. Drop uncommitted / un-applied Neon migrations
# Only removes migration files not yet reflected in the DB schema table
MIGRATION_DIR="drizzle"
if [ -d "$MIGRATION_DIR" ]; then
  echo "Checking for pending migration files beyond $LAST_GREEN_TAG ..."
  # Files added after the green tag that are not yet committed to main history
  git diff "$LAST_GREEN_TAG"..HEAD -- "$MIGRATION_DIR" --name-only 2>/dev/null \
    | xargs -r rm -v || true
fi

# 3. Close orphaned phase-* PRs
echo "Closing orphaned phase-* PRs ..."
gh pr list --state open --head 'phase-*' --json number -q '.[].number' \
  | xargs -I{} gh pr close {} --delete-branch 2>/dev/null || true

# 4. Delete Vercel preview deployments for closed phase branches
if [ -n "${VERCEL_TOKEN:-}" ]; then
  echo "Pruning Vercel preview deployments ..."
  vercel ls --token "$VERCEL_TOKEN" --json 2>/dev/null \
    | jq -r '.deployments[] | select(.state == "READY" and (.meta.githubCommitRef // "" | test("^phase-"))) | .uid' \
    | xargs -I{} vercel rm {} --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
else
  echo "VERCEL_TOKEN not set — skipping preview deploy cleanup"
fi

echo "=== cleanup.sh done ==="
