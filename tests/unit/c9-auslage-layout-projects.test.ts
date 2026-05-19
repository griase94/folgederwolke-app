/**
 * @phase-7.5 C9 — AT-002: public Auslage layout server-load returns projects.
 *
 * Previously the `+layout.server.ts` stubbed `projects: []`, which made the
 * project-select in the public form permanently empty. This test asserts the
 * load function pulls active (non-deleted) projects from the DB and exposes
 * them in the shape the form expects.
 */

import { describe, expect, it } from "vitest";
import { load } from "../../src/routes/auslage-einreichen/+layout.server.js";

// Minimal shim — the load function only consumes nothing from the event in
// our happy path, but SvelteKit types require a value.
const event = {} as Parameters<typeof load>[0];

describe("C9 AT-002 — auslage-einreichen layout load returns projects", () => {
  it("returns a non-empty projects array (seeded fixtures contain projects)", async () => {
    const data = await load(event);
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects.length).toBeGreaterThan(0);
  });

  it("each project has the { id, name } shape consumed by AuslagenForm", async () => {
    const data = await load(event);
    for (const p of data.projects) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(p.name.length).toBeGreaterThan(0);
    }
  });

  it("does not return archived (soft-deleted) projects", async () => {
    const data = await load(event);
    // The shape doesn't carry deletedAt — the contract is "only active". This
    // is enforced by the load() query; we just sanity-check the count matches
    // the count of non-deleted projects via a direct DB read.
    const { getDb } = await import("$lib/server/db/index.js");
    const { projects } = await import("$lib/server/db/schema/projects.js");
    const { isNull, count } = await import("drizzle-orm");
    const db = getDb();
    const [row] = await db
      .select({ n: count() })
      .from(projects)
      .where(isNull(projects.deletedAt));
    expect(data.projects.length).toBe(Number(row?.n ?? 0));
  });
});
