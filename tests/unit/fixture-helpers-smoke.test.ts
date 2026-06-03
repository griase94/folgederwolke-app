/**
 * Smoke test: verify the db-seed helpers compile and connect to the test DB.
 * @phase-0
 */

import { describe, it, expect } from "vitest";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { getMemberBeitrag } from "../helpers/queries.js";

describe("@phase-0 fixture helpers smoke test", () => {
  it("seedMember creates a row with a valid id", async () => {
    const m = await seedMember({ name: "Smoke" });
    expect(m.id).toBeTruthy();
    expect(m.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("seedOpenBeitrag creates a beitrag row", async () => {
    const m = await seedMember({ name: "SmokeB" });
    await seedOpenBeitrag({ memberId: m.id, year: 2026 });
    const row = await getMemberBeitrag(m.id, 2026);
    expect(row).toBeDefined();
    expect(row?.paidCents).toBe(0n);
    expect(row?.betragCents).toBe(6969n);
  });
});
