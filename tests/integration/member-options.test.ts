// tests/integration/member-options.test.ts
import { describe, it, expect } from "vitest";
import { listMemberOptions } from "$lib/server/domain/transaction-pickers.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

describe.skipIf(!dbConfigured)("listMemberOptions", () => {
  it("returns members as {id,label} sorted by (nachname, vorname)", async () => {
    const opts = await listMemberOptions();
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(0); // Phase 1 seed-fixtures seeds ≥1 member
    expect(typeof opts[0]!.id).toBe("string");
    expect(typeof opts[0]!.label).toBe("string");

    // Order contract: listMemberOptions sorts by (nachname, vorname). The label
    // is "vorname nachname", so asserting the LABELS are in lexical order is
    // wrong — and flaky, because which members exist (showcase corpus + Phase-1
    // fixtures, e.g. "…Fixture") shifts the first two labels. Instead assert the
    // returned id sequence matches a direct re-query in the SAME DB-collation
    // order, which is correct and robust to whatever members are present.
    const db = getDb();
    const expected = await db
      .select({ id: members.id })
      .from(members)
      .orderBy(members.nachname, members.vorname);
    expect(opts.map((o) => o.id)).toEqual(expected.map((r) => r.id));
  });
});
