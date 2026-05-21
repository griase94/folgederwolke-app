#!/usr/bin/env bash
set -eu

# Files allowed to reference the @internal storage helpers.
ALLOWED='(vercel-blob-impl|in-memory-mock-impl|local-fs-impl|chaos-impl|upload-pipeline|files-reconcile|festschreibung-reset|check-internal-del)\.(ts|sh)'

matches=$(grep -rn "_internalDelByPath\|_internalQuarantine\|_internalList" src/ scripts/ tests/integration/_helpers/ 2>/dev/null \
  | grep -vE "$ALLOWED" \
  | grep -v ".test.ts" \
  || true)

if [ -n "$matches" ]; then
  echo "FAIL: _internal* methods referenced outside allowed callsites:"
  echo "$matches"
  exit 1
fi
echo "OK: _internal* methods only used in allowed callsites"
