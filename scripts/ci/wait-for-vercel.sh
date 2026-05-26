#!/usr/bin/env bash
# Poll Vercel's Deployments API until the deployment for $1 (a commit SHA) is READY.
#
# Required env:
#   VERCEL_TOKEN
#   VERCEL_PROJECT_ID
#   VERCEL_ORG_ID (optional)
#
# Output (single line, suitable for $GITHUB_OUTPUT):
#   url=https://<deployment-url>
#
# Exits non-zero on timeout or ERROR/CANCELED state.

set -euo pipefail
SHA="${1:?usage: wait-for-vercel.sh <commit-sha>}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN is required}"
: "${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID is required}"
TIMEOUT_S="${TIMEOUT_S:-480}"
INTERVAL_S=10
DEADLINE=$(( $(date +%s) + TIMEOUT_S ))

API_BASE="https://api.vercel.com"
TEAM_PARAM=""
if [ -n "${VERCEL_ORG_ID:-}" ]; then
  TEAM_PARAM="&teamId=${VERCEL_ORG_ID}"
fi

FIRST_POLL=1
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  # NOTE: dropped -f so we capture HTTP status code even on 4xx/5xx; the
  # silent fallback hid stale-token failures as "stuck in PENDING".
  RESP_RAW=$(curl -s -w '\nHTTPCODE:%{http_code}' -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "${API_BASE}/v6/deployments?projectId=${VERCEL_PROJECT_ID}&meta-githubCommitSha=${SHA}&limit=1${TEAM_PARAM}")
  HTTP_CODE=$(echo "$RESP_RAW" | sed -n 's/^HTTPCODE://p')
  RESP=$(echo "$RESP_RAW" | sed '/^HTTPCODE:/d')
  if [ "$FIRST_POLL" = "1" ]; then
    echo "first-poll HTTP=${HTTP_CODE} resp_len=${#RESP} resp_head=$(echo "$RESP" | head -c 200)" >&2
    FIRST_POLL=0
  fi
  if [ -z "$RESP" ] || [ "$HTTP_CODE" != "200" ]; then RESP='{"deployments":[]}'; fi

  STATE=$(echo "$RESP" | jq -r '.deployments[0].readyState // "PENDING"')
  URL=$(echo "$RESP"  | jq -r '.deployments[0].url // ""')

  case "$STATE" in
    READY)
      if [ -z "$URL" ]; then
        echo "READY state but no URL in response for SHA ${SHA}" >&2
        exit 1
      fi
      echo "url=https://${URL}"
      exit 0
      ;;
    ERROR|CANCELED)
      echo "deploy ${STATE} for SHA ${SHA}" >&2
      exit 1
      ;;
    *)
      echo "waiting (state=${STATE}, sha=${SHA})..." >&2
      sleep "$INTERVAL_S"
      ;;
  esac
done

echo "timeout after ${TIMEOUT_S}s waiting for ${SHA}" >&2
exit 1
