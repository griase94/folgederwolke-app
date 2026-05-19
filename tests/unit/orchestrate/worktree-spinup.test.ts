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
});
