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
TIMEOUT_S="${TIMEOUT_S:-480}"
INTERVAL_S=10
DEADLINE=$(( $(date +%s) + TIMEOUT_S ))

API_BASE="https://api.vercel.com"
TEAM_PARAM=""
if [ -n "${VERCEL_ORG_ID:-}" ]; then
  TEAM_PARAM="&teamId=${VERCEL_ORG_ID}"
fi

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  RESP=$(curl -sf -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "${API_BASE}/v6/deployments?projectId=${VERCEL_PROJECT_ID}&meta-githubCommitSha=${SHA}&limit=1${TEAM_PARAM}" \
    || echo '{"deployments":[]}')

  STATE=$(echo "$RESP" | jq -r '.deployments[0].readyState // "PENDING"')
  URL=$(echo "$RESP"  | jq -r '.deployments[0].url // ""')

  case "$STATE" in
    READY)
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
