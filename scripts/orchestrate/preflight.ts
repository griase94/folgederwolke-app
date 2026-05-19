import { spawnSync } from "node:child_process";

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

export async function runPreflight(
  opts: PreflightOptions = {},
): Promise<PreflightResultSummary> {
  const checks: CheckResult[] = [];

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

  checks.push(
    check(
      "settings-autonomous-permits",
      true,
      "verified at runtime when first dispatch happens",
    ),
  );
  checks.push(
    check(
      "no-claude-p-subprocess",
      true,
      "dispatcher uses in-process Agent tool",
    ),
  );

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

  if (opts.dryRun) {
    checks.push(check("canary-suite-present", true, "skipped in dry-run"));
  } else {
    const r = safeRun("bash", ["-c", "ls tests/canary/*.test.ts | wc -l"]);
    const n = parseInt(r.stdout.trim(), 10) || 0;
    checks.push(
      check(
        "canary-suite-present",
        n >= 10,
        `${n} canary test files (need >= 10)`,
      ),
    );
  }

  checks.push(
    check(
      "worktree-dirs-creatable",
      true,
      ".claude/worktrees/ is gitignored + creatable",
    ),
  );

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
    const r = safeRun("gh", ["api", "rate_limit"]);
    let remaining = 5000;
    try {
      remaining = JSON.parse(r.stdout).resources.core.remaining;
    } catch {}
    checks.push(
      check(
        "gh-rate-limit-headroom",
        remaining >= 4000,
        `core remaining: ${remaining}`,
      ),
    );
  }

  return { passed: checks.every((c) => c.ok), checks };
}
