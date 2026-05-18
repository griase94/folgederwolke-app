#!/usr/bin/env bash
set -euo pipefail

# ABORT sentinel check
[ -f ~/.folgederwolke-build/state/ABORT ] && { echo "STOP user_abort"; exit 1; }

PHASE=$1
LOG="scripts/orchestration/logs/checkpoint-${PHASE}.log"
mkdir -p "$(dirname "$LOG")"

# Per-phase test scope (cumulative, not full suite every time)
case "$PHASE" in
  0)   STEPS=(typecheck lint build) ;;
  1|2) STEPS=(typecheck lint test build) ;;
  *)   STEPS=(typecheck lint build test "test:e2e --grep @phase-${PHASE}") ;;
esac

{
  for s in "${STEPS[@]}"; do
    echo "=== $s ==="
    eval "pnpm $s" || exit 1
  done
} > "$LOG" 2>&1 || { tail -30 "$LOG"; echo "FAIL_LOCAL"; exit 1; }

git push origin main 2>&1 | tee -a "$LOG"
sleep 10  # give GH a chance to register the run
RUN_ID=$(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status >> "$LOG" 2>&1 \
  || { echo "FAIL_CI run=$RUN_ID"; exit 2; }

# Post-deploy smoke with retry (CDN propagation)
DEPLOY_URL="https://folgederwolke-app.vercel.app"
for i in 1 2 3 4 5 6; do
  sleep $((i * 10))
  if curl -fsS "$DEPLOY_URL/healthz" 2>/dev/null | jq -e '.db == "ok" and .drive == "ok"' >/dev/null 2>&1; then
    echo "PASS"
    exit 0
  fi
done
echo "FAIL_DEPLOY_SMOKE"; exit 3
