import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("worktree-spinup.sh", () => {
  const script = "scripts/orchestrate/worktree-spinup.sh";
  it("is executable", () => {
    expect(statSync(script).mode & 0o111).toBeTruthy();
  });
  it("rejects missing arg", () => {
    const r = spawnSync(script, [], { encoding: "utf-8" });
    expect(r.status).not.toBe(0);
  });
  it("declares port bases 5440 + 5180", () => {
    const text = readFileSync(script, "utf-8");
    expect(text).toMatch(/PORT_BASE_POSTGRES=5440/);
    expect(text).toMatch(/PORT_BASE_VITE=5180/);
  });
  it("dry-run targets 'main' as the base ref (B2)", () => {
    const r = spawnSync(script, ["--dry-run", "c1"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.dry_run).toBe(true);
    expect(out.base_ref).toBe("main");
    // and the would_run command line must mention 'main' as the source ref
    // (after the worktree path), not the non-existent integration branch
    const cmd = out.would_run.find((s: string) => s.includes("worktree add"));
    expect(cmd).toMatch(/worktree add .* main$/);
    expect(cmd).not.toMatch(/worktree add .* overnight-2026-05-20$/);
    // The cluster branch *name* still uses the date prefix (that's a branch
    // we create with -B, not the base we branch from).
    expect(out.branch).toMatch(/^overnight-2026-05-20\/c1-/);
  });
});
