#!/usr/bin/env bash
# Fails if any FdW-identity fallback literal survives in src/.
#
# White-label Phase 1 (Task 4.3): identity (Verein name, address, mail-from)
# must source from readStammdaten()/env — never from a silent `|| "Folge der
# Wolke …"` fallback that would make a forked deployment impersonate FdW.
# This gate forbids the `||`-fallback shapes that PR1–PR4 removed.
#
# Used by .github/workflows/security.yml on every PR. Also runnable locally.
# Exits non-zero (CI failure) if any pattern is found. Mirrored by the meta
# unit test tests/unit/no-fdw-fallbacks.test.ts for local `pnpm test` runs.
set -euo pipefail

# This is a REGRESSION guard, not an exhaustive linter: it forbids the exact
# `|| "FdW…"` fallback literals that PR1–PR4 removed (case-insensitive). It does
# not try to catch every conceivable fallback shape (`??`, ternaries, etc.) —
# its job is to stop the removed literals from creeping back.
#
# Guard against a silent false-pass: if src/ is missing (script run from the
# wrong directory), `grep` exits 2 and the `if` below would fall through to a
# bogus "✓ … exit 0". Fail loudly instead.
if [ ! -d src ]; then
  echo "❌ src/ not found — run this from the repo root." >&2
  exit 2
fi

patterns='\|\| *"Folge der Wolke|\|\| *"noreply@folgederwolke|\|\| *"Westermuehl|\|\| *"Westermühl'
if grep -rIniE "$patterns" src/ ; then
  echo "❌ Residual FdW identity fallback(s) found above. Source identity from readStammdaten()/env." >&2
  exit 1
fi
echo "✓ No FdW identity fallbacks in src/"
