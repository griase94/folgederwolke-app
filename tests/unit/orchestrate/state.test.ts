import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadState,
  saveState,
  initialState,
  type OvernightState,
} from "../../../scripts/orchestrate/state.js";

describe("orchestrate/state", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fdw-state-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when state file does not exist", async () => {
    expect(await loadState(join(dir, "missing.json"))).toBeNull();
  });

  it("writes state atomically via tmp+rename", async () => {
    const path = join(dir, "state.json");
    const state = initialState();
    await saveState(path, state);
    expect(await loadState(path)).toEqual(state);
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
  });

  it("initialState returns 9 clusters in WAITING_DISPATCH", () => {
    const s = initialState();
    expect(Object.keys(s.clusters)).toHaveLength(9);
    for (const c of Object.values(s.clusters)) {
      expect(c.state).toBe("WAITING_DISPATCH");
      expect(c.cycles).toEqual([]);
    }
  });

  it("schema includes version + started_at + preflight + wave + infra_health", () => {
    const s: OvernightState = initialState();
    expect(s.version).toBe(1);
    expect(s.started_at).toMatch(/^20\d{2}-\d{2}-\d{2}T/);
    expect(s.wave).toBe(0);
    expect(s.preflight).toEqual({ passed: false, checks: [] });
    expect(s.infra_health.docker_ok).toBe(false);
  });

  it("port offsets c1=5441/5181 → c9=5449/5189", () => {
    const s = initialState();
    expect(s.clusters.c1.ports).toEqual({ postgres: 5441, vite: 5181 });
    expect(s.clusters.c9.ports).toEqual({ postgres: 5449, vite: 5189 });
    expect(s.clusters.c1.db_name).toBe("folgederwolke_test_c1");
  });
});
