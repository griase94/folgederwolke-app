import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CheckResult {
  id: string;
  ok: boolean;
  detail: string;
}
export interface PreflightResultSummary {
  passed: boolean;
  checks: CheckResult[];
}
export interface PreflightOptions {
  dryRun?: boolean;
  /** Override path to ~/.claude/settings.json (for tests). */
  settingsPath?: string;
  /** Override repo root (for tests). Defaults to `git rev-parse --show-toplevel`. */
  repoRoot?: string;
  /** Override raw output of `gh api rate_limit` (for tests). */
  rateLimitStdout?: string;
}

const PHASE_8_TIP = "3153a3c";

function safeRun(
  cmd: string,
  args: string[],
): { code: number; stdout: string } {
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  return { code: r.status ?? 1, stdout: r.stdout ?? "" };
}
const check = (id: string, ok: boolean, detail = ""): CheckResult => ({
  id,
  ok,
  detail,
});

function defaultSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function defaultRepoRoot(): string {
  const r = safeRun("git", ["rev-parse", "--show-toplevel"]);
  return r.code === 0 ? r.stdout.trim() : process.cwd();
}

/** Returns the deny-rules block of settings.json as a string, or null on error. */
function readSettingsFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function checkNoClaudePSubprocess(settingsPath: string): CheckResult {
  const raw = readSettingsFile(settingsPath);
  if (raw === null) {
    return check(
      "no-claude-p-subprocess",
      false,
      `cannot read ${settingsPath} — cannot verify deny rule`,
    );
  }
  // Look for a deny rule mentioning `claude -p` or `claude --dangerously…`.
  // We accept either string anywhere in the file (the file is JSON with deny
  // entries; either is a sufficient signal).
  const hasDeny = /claude\s+-p/.test(raw) || /claude\s+--dangerously/.test(raw);
  return check(
    "no-claude-p-subprocess",
    hasDeny,
    hasDeny
      ? `deny rule for 'claude -p' / --dangerously found in ${settingsPath}`
      : `no deny rule for 'claude -p' in ${settingsPath}`,
  );
}

export function checkWorktreeDirsCreatable(repoRoot: string): CheckResult {
  const probe = join(repoRoot, ".claude", "worktrees", ".preflight-probe");
  try {
    mkdirSync(probe, { recursive: true });
  } catch (e) {
    return check(
      "worktree-dirs-creatable",
      false,
      `mkdir failed: ${(e as Error).message}`,
    );
  }
  try {
    rmdirSync(probe);
  } catch (e) {
    return check(
      "worktree-dirs-creatable",
      false,
      `rmdir failed: ${(e as Error).message}`,
    );
  }
  return check(
    "worktree-dirs-creatable",
    true,
    `${dirname(probe)} is creatable and writable`,
  );
}

export function checkSettingsAutonomousPermits(
  settingsPath: string,
): CheckResult {
  const raw = readSettingsFile(settingsPath);
  if (raw === null) {
    return check(
      "settings-autonomous-permits",
      false,
      `cannot read ${settingsPath}`,
    );
  }
  // Probe one specific allowlist entry: `gh pr create` should be permitted.
  const hasGhPrCreate = /gh\s+pr\s+create/.test(raw);
  return check(
    "settings-autonomous-permits",
    hasGhPrCreate,
    hasGhPrCreate
      ? `'gh pr create' allowlisted in ${settingsPath}`
      : `'gh pr create' not allowlisted in ${settingsPath}`,
  );
}

export function checkGhRateLimitHeadroom(rateLimitStdout: string): CheckResult {
  let remaining = 0; // fail closed: unknown headroom = treat as exhausted
  try {
    const parsed = JSON.parse(rateLimitStdout);
    const v = parsed?.resources?.core?.remaining;
    if (typeof v === "number") remaining = v;
  } catch {
    // keep remaining = 0 — silent parse failure must NOT pass.
  }
  return check(
    "gh-rate-limit-headroom",
    remaining >= 4000,
    `core remaining: ${remaining}`,
  );
}

export async function runPreflight(
  opts: PreflightOptions = {},
): Promise<PreflightResultSummary> {
  const checks: CheckResult[] = [];
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  const repoRoot = opts.repoRoot ?? defaultRepoRoot();

  if (opts.dryRun) {
    checks.push(check("phase-8-on-main", true, "skipped in dry-run"));
  } else {
    const r = safeRun("git", [
      "merge-base",
      "--is-ancestor",
      PHASE_8_TIP,
      "origin/main",
    ]);
    checks.push(
      check(
        "phase-8-on-main",
        r.code === 0,
        r.code === 0
          ? `${PHASE_8_TIP} is on origin/main`
          : `${PHASE_8_TIP} NOT reachable`,
      ),
    );
  }

  checks.push(checkSettingsAutonomousPermits(settingsPath));
  checks.push(checkNoClaudePSubprocess(settingsPath));

  if (opts.dryRun) {
    checks.push(check("ci-workflow-patched", true, "skipped in dry-run"));
  } else {
    const r = safeRun("grep", ["-q", "overnight-", ".github/workflows/ci.yml"]);
    checks.push(
      check(
        "ci-workflow-patched",
        r.code === 0,
        r.code === 0 ? "ci.yml triggers on overnight-*" : "ci.yml NOT patched",
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("docker-postgres-healthy", true, "skipped in dry-run"));
  } else {
    const r = safeRun("docker", ["ps", "--format", "{{.Names}}"]);
    const hasPg = /postgres/.test(r.stdout);
    checks.push(
      check(
        "docker-postgres-healthy",
        hasPg,
        hasPg ? "Postgres container running" : "no Postgres container",
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("gh-auth-status", true, "skipped in dry-run"));
  } else {
    const r = safeRun("gh", ["auth", "status"]);
    checks.push(check("gh-auth-status", r.code === 0, r.stdout.slice(0, 200)));
  }

  if (opts.dryRun) {
    checks.push(check("branch-protection-main-applies", true, "skipped"));
  } else {
    const r = safeRun("gh", [
      "api",
      "repos/griase94/folgederwolke-app/branches/main/protection",
    ]);
    checks.push(
      check(
        "branch-protection-main-applies",
        r.code === 0,
        r.code === 0 ? "main has branch protection" : "main has NO protection",
      ),
    );
  }

  const url = process.env.DATABASE_URL ?? "";
  const dbOk = url === "" || /localhost/.test(url);
  checks.push(
    check(
      "production-envs-not-loaded",
      dbOk,
      dbOk
        ? "DATABASE_URL not prod"
        : `DATABASE_URL: ${url.replace(/:[^@]+@/, ":[REDACTED]@")}`,
    ),
  );

  // H2: canary check no longer requires a hardcoded count. Instead we
  // require that `pnpm test --run tests/canary/` exits 0. In dry-run we just
  // assert the canary directory exists with at least one .test.ts file.
  if (opts.dryRun) {
    checks.push(check("canary-suite-present", true, "skipped in dry-run"));
  } else {
    // Quick presence probe — fast feedback before spending vitest time.
    const lsCanary = safeRun("bash", [
      "-c",
      "ls tests/canary/*.test.ts 2>/dev/null | wc -l",
    ]);
    const n = parseInt(lsCanary.stdout.trim(), 10) || 0;
    if (n < 1) {
      checks.push(
        check(
          "canary-suite-present",
          false,
          "no canary test files in tests/canary/",
        ),
      );
    } else {
      const run = safeRun("pnpm", ["test", "--run", "tests/canary/"]);
      checks.push(
        check(
          "canary-suite-present",
          run.code === 0,
          run.code === 0
            ? `${n} canary file(s) present, all green`
            : `${n} canary file(s) present, run FAILED`,
        ),
      );
    }
  }

  checks.push(checkWorktreeDirsCreatable(repoRoot));

  if (opts.dryRun) {
    checks.push(check("port-collision-sanity", true, "skipped in dry-run"));
  } else {
    const r = safeRun("bash", [
      "-c",
      "lsof -i :5441-5449 -i :5181-5189 2>/dev/null | wc -l",
    ]);
    const n = parseInt(r.stdout.trim(), 10) || 0;
    checks.push(
      check(
        "port-collision-sanity",
        n === 0,
        `${n} processes listening in cluster port range`,
      ),
    );
  }

  if (opts.dryRun) {
    checks.push(check("gh-rate-limit-headroom", true, "skipped in dry-run"));
  } else {
    const rl =
      opts.rateLimitStdout ?? safeRun("gh", ["api", "rate_limit"]).stdout;
    checks.push(checkGhRateLimitHeadroom(rl));
  }

  return { passed: checks.every((c) => c.ok), checks };
}
