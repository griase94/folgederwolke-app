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

patterns='\|\| *"Folge der Wolke|\|\| *"noreply@folgederwolke|\|\| *"Westermuehl|\|\| *"Westermühl'
if grep -rInE "$patterns" src/ ; then
  echo "❌ Residual FdW identity fallback(s) found above. Source identity from readStammdaten()/env." >&2
  exit 1
fi
echo "✓ No FdW identity fallbacks in src/"
