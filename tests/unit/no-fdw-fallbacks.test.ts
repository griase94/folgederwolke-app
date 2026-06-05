import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * White-label Phase 1 (Task 4.3) — meta gate.
 *
 * Mirrors `scripts/check-no-fdw-fallbacks.sh` so the same forbidden-fallback
 * contract is enforced on every local `pnpm test` run, not only in CI. It
 * validates that PR1–PR4 actually removed EVERY `|| "Folge der Wolke …"`-style
 * identity fallback from `src/`: if this fails, a real residual survived —
 * track it down in src/ and replace it with the settings/readStammdaten() or
 * env source the earlier PRs used. Do NOT relax the patterns to make it pass.
 *
 * Patterns forbidden (a literal `||` fallback to an FdW identity string):
 *   - || "Folge der Wolke …"     (Verein name)
 *   - || "noreply@folgederwolke… (mail from)
 *   - || "Westermuehl…" / "Westermühl…" (FdW address, both spellings)
 */

const repoRoot = resolve(__dirname, "..", "..");
const scriptPath = resolve(repoRoot, "scripts", "check-no-fdw-fallbacks.sh");

// Same alternation as scripts/check-no-fdw-fallbacks.sh. Kept here too so a
// direct `grep` run (below) double-checks the script logic without relying on
// the script's own exit semantics.
const PATTERNS =
  '\\|\\| *"Folge der Wolke|\\|\\| *"noreply@folgederwolke|\\|\\| *"Westermuehl|\\|\\| *"Westermühl';

describe("no FdW identity fallbacks in src/ (Task 4.3)", () => {
  it("the CI grep-gate script reports zero residual fallbacks", () => {
    const res = spawnSync("bash", [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(
      res.status,
      `check-no-fdw-fallbacks.sh failed — residual fallback(s):\n${res.stdout}${res.stderr}`,
    ).toBe(0);
  });

  it("a direct grep over src/ finds zero forbidden-fallback patterns", () => {
    const res = spawnSync("grep", ["-rInE", PATTERNS, "src/"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    // grep exits 1 (no matches) on success here; exit 0 means a match was found.
    expect(
      res.status,
      `forbidden FdW identity fallback(s) found in src/:\n${res.stdout}`,
    ).not.toBe(0);
    expect(res.stdout).toBe("");
  });
});
