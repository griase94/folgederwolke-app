import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkGhRateLimitHeadroom,
  checkNoClaudePSubprocess,
  checkSettingsAutonomousPermits,
  checkWorktreeDirsCreatable,
  runPreflight,
} from "../../../scripts/orchestrate/preflight.js";

function tmpSettings(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "preflight-test-"));
  const path = join(dir, "settings.json");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("runPreflight", () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("returns 12 named checks", async () => {
    const r = await runPreflight({ dryRun: true });
    const ids = r.checks.map((c) => c.id);
    for (const required of [
      "phase-8-on-main",
      "settings-autonomous-permits",
      "no-claude-p-subprocess",
      "ci-workflow-patched",
      "docker-postgres-healthy",
      "gh-auth-status",
      "branch-protection-main-applies",
      "production-envs-not-loaded",
      "canary-suite-present",
      "worktree-dirs-creatable",
      "port-collision-sanity",
      "gh-rate-limit-headroom",
    ]) {
      expect(ids).toContain(required);
    }
  });

  it("flags DATABASE_URL pointing to Neon prod", async () => {
    process.env.DATABASE_URL =
      "postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db";
    const r = await runPreflight({ dryRun: true });
    expect(
      r.checks.find((c) => c.id === "production-envs-not-loaded")?.ok,
    ).toBe(false);
  });

  it("accepts localhost DATABASE_URL", async () => {
    process.env.DATABASE_URL =
      "postgres://app_runtime:app_runtime@localhost:15432/folgederwolke_test";
    const r = await runPreflight({ dryRun: true });
    expect(
      r.checks.find((c) => c.id === "production-envs-not-loaded")?.ok,
    ).toBe(true);
  });

  it("passed=true iff every check passes", async () => {
    const r = await runPreflight({ dryRun: true });
    expect(r.passed).toBe(r.checks.every((c) => c.ok));
  });
});

describe("H1: no-claude-p-subprocess check", () => {
  it("FAILS when settings file is missing", () => {
    const r = checkNoClaudePSubprocess(
      "/tmp/definitely-does-not-exist-" + Date.now() + ".json",
    );
    expect(r.id).toBe("no-claude-p-subprocess");
    expect(r.ok).toBe(false);
  });
  it("FAILS when settings file has no claude -p deny rule", () => {
    const p = tmpSettings(`{"permissions": {"allow": ["ls"]}}`);
    const r = checkNoClaudePSubprocess(p);
    expect(r.ok).toBe(false);
    rmSync(p, { force: true });
  });
  it("PASSES when 'claude -p' deny rule present", () => {
    const p = tmpSettings(`{"permissions": {"deny": ["Bash(claude -p:*)"]}}`);
    const r = checkNoClaudePSubprocess(p);
    expect(r.ok).toBe(true);
    rmSync(p, { force: true });
  });
  it("PASSES when 'claude --dangerously' deny rule present", () => {
    const p = tmpSettings(
      `{"permissions": {"deny": ["Bash(claude --dangerously-*:*)"]}}`,
    );
    const r = checkNoClaudePSubprocess(p);
    expect(r.ok).toBe(true);
    rmSync(p, { force: true });
  });
});

describe("H1: worktree-dirs-creatable check", () => {
  it("PASSES when repo root is writable", () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-wt-"));
    const r = checkWorktreeDirsCreatable(dir);
    expect(r.id).toBe("worktree-dirs-creatable");
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
  it("FAILS when repo root is not writable", () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-wt-ro-"));
    chmodSync(dir, 0o500); // r-x only — mkdir inside should fail
    const r = checkWorktreeDirsCreatable(dir);
    chmodSync(dir, 0o700); // restore so cleanup works
    rmSync(dir, { recursive: true, force: true });
    expect(r.ok).toBe(false);
  });
});

describe("H1: settings-autonomous-permits check", () => {
  it("FAILS when 'gh pr create' not in settings", () => {
    const p = tmpSettings(`{"permissions": {"allow": ["Bash(ls:*)"]}}`);
    const r = checkSettingsAutonomousPermits(p);
    expect(r.id).toBe("settings-autonomous-permits");
    expect(r.ok).toBe(false);
    rmSync(p, { force: true });
  });
  it("PASSES when 'gh pr create' allowlisted", () => {
    const p = tmpSettings(
      `{"permissions": {"allow": ["Bash(gh pr create:*)"]}}`,
    );
    const r = checkSettingsAutonomousPermits(p);
    expect(r.ok).toBe(true);
    rmSync(p, { force: true });
  });
  it("FAILS when settings file missing", () => {
    const r = checkSettingsAutonomousPermits(
      "/tmp/missing-settings-" + Date.now() + ".json",
    );
    expect(r.ok).toBe(false);
  });
});

describe("H3: gh-rate-limit-headroom fails closed on parse error", () => {
  it("FAILS when stdout is empty (parse error)", () => {
    const r = checkGhRateLimitHeadroom("");
    expect(r.id).toBe("gh-rate-limit-headroom");
    expect(r.ok).toBe(false);
    // detail should mention 0 remaining
    expect(r.detail).toContain("0");
  });
  it("FAILS when stdout is garbage (parse error)", () => {
    const r = checkGhRateLimitHeadroom("not json at all");
    expect(r.ok).toBe(false);
  });
  it("FAILS when remaining is below threshold", () => {
    const r = checkGhRateLimitHeadroom(
      JSON.stringify({ resources: { core: { remaining: 100 } } }),
    );
    expect(r.ok).toBe(false);
  });
  it("PASSES when remaining is well above threshold", () => {
    const r = checkGhRateLimitHeadroom(
      JSON.stringify({ resources: { core: { remaining: 4500 } } }),
    );
    expect(r.ok).toBe(true);
  });
});
