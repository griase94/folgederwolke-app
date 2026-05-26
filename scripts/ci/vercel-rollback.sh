#!/usr/bin/env bash
# Promote the second-most-recent READY production deployment to Current
# ("Instant Rollback"). Called by .github/workflows/post-deploy-smoke.yml
# after two consecutive smoke failures.
#
# Required env:
#   VERCEL_TOKEN        — Vercel access token with project:write scope
#   VERCEL_PROJECT_ID   — Vercel project ID (prj_xxx)
# Optional:
#   VERCEL_ORG_ID       — Team ID (team_xxx); required on team-scoped tokens
#
# API endpoints used (confirmed 2026-05-26):
#   GET  /v6/deployments?projectId=...&state=READY&target=production&limit=2
#        → returns deployments[] sorted newest-first
#   POST /v9/projects/{projectId}/rollback/{deploymentId}?teamId=...
#        → empty JSON body; promotes the named deployment to Current alias
#
# Behaviour:
#   - Lists the two most-recent READY production deployments.
#   - Takes deployments[1] (the PREVIOUS prod — newest is the broken one we
#     just deployed and want to roll OFF of).
#   - Issues the rollback POST. On HTTP 2xx logs the previous URL + exits 0.
#   - On any failure (no previous deploy, API non-2xx, missing fields) logs
#     to stderr and exits 1 so the workflow surfaces RED.

set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"

API_BASE="https://api.vercel.com"

# Build a teamId query suffix once. Both list + rollback need it on
# team-scoped tokens; passing an empty teamId would be rejected so we omit
# the param entirely when VERCEL_ORG_ID is unset (personal-account tokens).
TEAM_QUERY=""
TEAM_AMP=""
if [ -n "${VERCEL_ORG_ID:-}" ]; then
  TEAM_QUERY="?teamId=${VERCEL_ORG_ID}"
  TEAM_AMP="&teamId=${VERCEL_ORG_ID}"
fi

LIST_URL="${API_BASE}/v6/deployments?projectId=${VERCEL_PROJECT_ID}&state=READY&target=production&limit=2${TEAM_AMP}"

echo "Listing two most-recent READY production deployments..." >&2
LIST_RESP=$(curl -sS -w "\n%{http_code}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "${LIST_URL}")

LIST_BODY=$(printf '%s' "$LIST_RESP" | sed '$d')
LIST_CODE=$(printf '%s' "$LIST_RESP" | tail -n1)

if [ "$LIST_CODE" != "200" ]; then
  echo "::error::list deployments returned HTTP ${LIST_CODE}" >&2
  echo "$LIST_BODY" >&2
  exit 1
fi

COUNT=$(printf '%s' "$LIST_BODY" | jq -r '.deployments | length')
if [ "$COUNT" -lt 2 ]; then
  echo "::error::need at least 2 READY production deployments to roll back (got ${COUNT})" >&2
  exit 1
fi

PREV_ID=$(printf '%s' "$LIST_BODY" | jq -r '.deployments[1].uid // ""')
PREV_URL=$(printf '%s' "$LIST_BODY" | jq -r '.deployments[1].url // ""')
CURRENT_ID=$(printf '%s' "$LIST_BODY" | jq -r '.deployments[0].uid // ""')
CURRENT_URL=$(printf '%s' "$LIST_BODY" | jq -r '.deployments[0].url // ""')

if [ -z "$PREV_ID" ] || [ "$PREV_ID" = "null" ]; then
  echo "::error::could not extract previous deployment uid from list response" >&2
  echo "$LIST_BODY" >&2
  exit 1
fi

echo "Current (broken)  : ${CURRENT_URL} (${CURRENT_ID})" >&2
echo "Rolling back to   : ${PREV_URL} (${PREV_ID})" >&2

ROLLBACK_URL="${API_BASE}/v9/projects/${VERCEL_PROJECT_ID}/rollback/${PREV_ID}${TEAM_QUERY}"

ROLL_RESP=$(curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${ROLLBACK_URL}")

ROLL_BODY=$(printf '%s' "$ROLL_RESP" | sed '$d')
ROLL_CODE=$(printf '%s' "$ROLL_RESP" | tail -n1)

# Vercel returns 200/201 on accepted rollback. Any 2xx is success.
if [ "$ROLL_CODE" -lt 200 ] || [ "$ROLL_CODE" -ge 300 ]; then
  echo "::error::rollback POST returned HTTP ${ROLL_CODE}" >&2
  echo "$ROLL_BODY" >&2
  exit 1
fi

echo "Rollback initiated: ${PREV_URL}"
exit 0
