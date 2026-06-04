// tests/integration/member-options.test.ts
import { describe, it, expect } from "vitest";
import { listMemberOptions } from "$lib/server/domain/transaction-pickers.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

describe.skipIf(!dbConfigured)("listMemberOptions", () => {
  it("returns members as {id,label} sorted by name", async () => {
    const opts = await listMemberOptions();
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(0); // Phase 1 seed-fixtures seeds ≥1 member
    if (opts.length > 1)
      expect(opts[0]!.label.localeCompare(opts[1]!.label)).toBeLessThanOrEqual(
        0,
      );
    if (opts.length) {
      expect(typeof opts[0]!.id).toBe("string");
      expect(typeof opts[0]!.label).toBe("string");
    }
  });
});
