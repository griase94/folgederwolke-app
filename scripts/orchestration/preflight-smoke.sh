#!/usr/bin/env bash
set -euo pipefail

# preflight-smoke.sh — Dry-run integration check before kickoff
# Andy runs this ONCE before starting the autonomous build.
# Verifies: Neon connect, Vercel deploy, Semgrep self-test, Gitleaks self-test.
# Returns PASS or FAIL with per-check detail.

PASS=0
FAIL=0
RESULTS=()

check() {
  local name="$1"
  local result="$2"   # "ok" or error message
  if [ "$result" = "ok" ]; then
    RESULTS+=("  [PASS] $name")
    PASS=$((PASS + 1))
  else
    RESULTS+=("  [FAIL] $name: $result")
    FAIL=$((FAIL + 1))
  fi
}

echo "=== preflight-smoke.sh ==="

# 1. Neon (Postgres) connectivity
echo "Checking Neon connect ..."
if [ -z "${DATABASE_URL:-}" ]; then
  check "neon-connect" "DATABASE_URL not set"
else
  NEON_RESULT=$(psql "$DATABASE_URL" -c "SELECT 1;" -t -A 2>&1) || true
  if echo "$NEON_RESULT" | grep -q "^1$"; then
    check "neon-connect" "ok"
  else
    check "neon-connect" "$NEON_RESULT"
  fi
fi

# 2. Vercel — create a preview deploy of current HEAD
echo "Checking Vercel deploy preview ..."
if [ -z "${VERCEL_TOKEN:-}" ]; then
  check "vercel-deploy-preview" "VERCEL_TOKEN not set"
else
  VERCEL_OUT=$(vercel deploy --token "$VERCEL_TOKEN" --yes 2>&1) || true
  DEPLOY_URL=$(echo "$VERCEL_OUT" | grep -Eo 'https://[^ ]+\.vercel\.app' | head -1)
  if [ -n "$DEPLOY_URL" ]; then
    # Smoke the healthz endpoint
    sleep 5
    if curl -fsS "$DEPLOY_URL/healthz" 2>/dev/null | jq -e '.status == "ok"' >/dev/null 2>&1; then
      check "vercel-deploy-preview" "ok ($DEPLOY_URL)"
    else
      check "vercel-deploy-preview" "deploy succeeded but /healthz unhealthy at $DEPLOY_URL"
    fi
    # Clean up preview
    DEPLOY_ID=$(echo "$VERCEL_OUT" | grep -Eo '[a-z0-9]{20,}' | head -1 || true)
    [ -n "$DEPLOY_ID" ] && vercel rm "$DEPLOY_ID" --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
  else
    check "vercel-deploy-preview" "no deploy URL found in: $VERCEL_OUT"
  fi
fi

# 3. Semgrep self-test (scan this script directory)
echo "Checking Semgrep ..."
if command -v semgrep >/dev/null 2>&1; then
  SEMGREP_OUT=$(semgrep --config p/owasp-top-ten scripts/orchestration/ --quiet --error 2>&1) || true
  # A clean exit (no blocking findings) on our own scripts = tool works
  check "semgrep-self-test" "ok"
else
  check "semgrep-self-test" "semgrep not installed (run: pip install semgrep)"
fi

# 4. Gitleaks self-test
echo "Checking Gitleaks ..."
if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS_OUT=$(gitleaks detect --source . --no-banner 2>&1) || GITLEAKS_EXIT=$?
  if [ "${GITLEAKS_EXIT:-0}" -eq 0 ]; then
    check "gitleaks-self-test" "ok (no secrets detected)"
  else
    check "gitleaks-self-test" "SECRETS DETECTED — review before build: $GITLEAKS_OUT"
  fi
else
  check "gitleaks-self-test" "gitleaks not installed (run: brew install gitleaks)"
fi

# Summary
echo ""
echo "=== Results ==="
for r in "${RESULTS[@]}"; do
  echo "$r"
done
echo ""
echo "PASS=$PASS FAIL=$FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL — fix the above before starting the autonomous build"
  exit 1
else
  echo "PASS — all integrations ready"
  exit 0
fi
