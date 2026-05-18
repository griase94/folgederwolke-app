#!/usr/bin/env bash
# Build + start the SvelteKit production server for Playwright e2e tests.
#
# Why this script (and not an inline `command:` in playwright.config.ts):
# Playwright's webServer.command historically dropped env vars when spawned
# from CI (Ubuntu) regardless of `env:` config or inline `$VAR` expansion.
# A dedicated script invoked via `bash` keeps the env propagation
# explicit and debuggable — `env | grep` below prints what we actually got.
set -euo pipefail

echo "[e2e-serve] env presence check:" >&2
for k in DATABASE_URL DIRECT_DATABASE_URL SESSION_SECRET ADMIN_EMAILS \
         MAIL_PROVIDER MAIL_FROM SMTP_HOST GOOGLE_OAUTH_CLIENT_ID \
         GOOGLE_OAUTH_REFRESH_TOKEN PUBLIC_FORM_ENABLED VEREIN_NAME; do
  val="${!k:-}"
  vlen="${#val}"
  if [ -n "$val" ]; then
    echo "  $k: SET (value-len=$vlen)" >&2
  else
    echo "  $k: EMPTY" >&2
  fi
  # Make absolutely sure each var is exported (so `exec node` sees it)
  export "$k=${val}"
done

# Build (cached deps via pnpm-action-setup)
pnpm build

# Reasonable defaults for vars not provided by the caller. PUBLIC_FORM_ENABLED
# must default to true so /auslage-einreichen + /auslage-status routes serve.
export PORT="${PORT:-4173}"
export HOST="${HOST:-127.0.0.1}"
export PUBLIC_FORM_ENABLED="${PUBLIC_FORM_ENABLED:-true}"
export VEREIN_NAME="${VEREIN_NAME:-Folge der Wolke e.V.}"

echo "[e2e-serve] launching node build/index.js on $HOST:$PORT" >&2
exec node ./build/index.js
