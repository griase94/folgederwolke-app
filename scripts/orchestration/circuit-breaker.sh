#!/usr/bin/env bash
set -euo pipefail

STATE_DIR=~/.folgederwolke-build/state
WALL_HRS=$(( ($(date +%s) - $(cat "$STATE_DIR/start_ts")) / 3600 ))
FAILS=$(cat "$STATE_DIR/consecutive_failures" 2>/dev/null || echo 0)
BUDGET=$(cat "$STATE_DIR/wallclock_budget_hours" 2>/dev/null || echo 13)
[ "$WALL_HRS" -gt "$BUDGET" ] && { echo "STOP wallclock=$WALL_HRS budget=$BUDGET"; exit 1; }
[ "$FAILS" -gt 2 ] && { echo "STOP consecutive_failures=$FAILS"; exit 1; }
[ -f "$STATE_DIR/ABORT" ] && { echo "STOP user_abort"; exit 1; }
echo "CONTINUE"
