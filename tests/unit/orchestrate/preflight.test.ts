import { afterEach, describe, expect, it } from "vitest";
import { runPreflight } from "../../../scripts/orchestrate/preflight.js";

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
