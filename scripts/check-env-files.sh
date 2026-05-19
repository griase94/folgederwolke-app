#!/usr/bin/env bash
# Scans the committed env files (.env.development, .env.test) for patterns
# that look like real secrets — Neon URLs, Resend API keys, real-looking
# Postgres URLs, etc.
#
# Used by .github/workflows/security.yml on every PR. Also runnable locally
# before commit. Exits non-zero (CI failure) if any pattern is found.
#
# Allowlisted dummy patterns:
#   - dev-only-not-secret-* (SESSION_SECRET dummies)
#   - test-only-not-secret-*
#   - localhost / 127.0.0.1 hosts
#   - app_runtime:app_runtime / app_export:app_export (dev role passwords)

set -euo pipefail

FILES=(".env.development" ".env.test")

# Patterns that should NEVER appear in committed env files. Each pattern is
# a perl-style regex; matching content triggers a failure.
FORBIDDEN_PATTERNS=(
  # Neon production hosts
  '@ep-[a-z0-9-]+\.[a-z0-9-]+\.aws\.neon\.tech'
  '@ep-[a-z0-9-]+\.[a-z0-9-]+\.azure\.neon\.tech'
  '@ep-[a-z0-9-]+\.[a-z0-9-]+\.gcp\.neon\.tech'
  # Resend live keys
  're_[A-Za-z0-9]{16,}'
  # Stripe live + test keys
  'sk_live_[A-Za-z0-9]{16,}'
  'sk_test_[A-Za-z0-9]{16,}'
  # GitHub PATs
  'gh[pous]_[A-Za-z0-9]{36,}'
  # Generic high-entropy base64-ish secrets > 40 chars (likely real)
  # Skip this — too noisy. Real Neon passwords are obvious from the host pattern above.
  # Google OAuth tokens
  'ya29\.[A-Za-z0-9_-]+'
  '1//[A-Za-z0-9_-]{40,}'
)

# Patterns explicitly allowed (matched first; if any line matches an allow
# pattern, that line is skipped before forbidden-pattern checks).
ALLOWED_PATTERNS=(
  'SESSION_SECRET=dev-only-not-secret'
  'SESSION_SECRET=test-only-not-secret'
  '@localhost:'
  '@127\.0\.0\.1:'
  'app_runtime:app_runtime@'
  'app_export:app_export@'
)

violations=0

for file in "${FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "check-env-files: skipping $file (not present)"
    continue
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    # Skip lines that match allowed patterns
    allowed=0
    for ap in "${ALLOWED_PATTERNS[@]}"; do
      if [[ "$line" =~ $ap ]]; then
        allowed=1
        break
      fi
    done
    [[ "$allowed" -eq 1 ]] && continue

    # Check forbidden patterns
    for fp in "${FORBIDDEN_PATTERNS[@]}"; do
      if [[ "$line" =~ $fp ]]; then
        echo "❌ $file: line matches forbidden pattern '$fp':"
        echo "   $line"
        violations=$((violations + 1))
      fi
    done
  done < "$file"
done

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "check-env-files: $violations violation(s) — refusing to pass."
  echo "If a real secret accidentally landed in a committed .env file:"
  echo "  1. Remove it from the file."
  echo "  2. Move the real value to .env.development.local or .env.test.local"
  echo "     (gitignored)."
  echo "  3. ROTATE the leaked secret — it's now in git history."
  exit 1
fi

echo "check-env-files: ✓ no suspicious patterns in committed env files"
