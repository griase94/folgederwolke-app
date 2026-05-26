/**
 * B1 regression: markBeitragPaid uses Berlin-local date, not UTC.
 *
 * At 23:01 UTC on Dec 31, new Date().toISOString().slice(0,10) returns
 * "2026-12-31" — but at 00:01 CET on Jan 1 2027 this is the WRONG day
 * (gezahlt_am should be "2027-01-01" for a payment made in January).
 *
 * After the B1 fix, berlinYmd() is used instead and returns "2027-01-01".
 *
 * @phase-0
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getMemberBeitrag } from "../helpers/queries.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";

// ---------------------------------------------------------------------------
// The import of markBeitragPaid must happen AFTER vi.useFakeTimers() is set up
// in each test, so we import it lazily. Actually since it uses new Date() at
// call time (not module init), a static import works fine.
// ---------------------------------------------------------------------------
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";

describe("@phase-0 markBeitragPaid — B1 Berlin-date regression", () => {
  afterEach(() => vi.useRealTimers());

  it("writes Berlin-local date (2027-01-01) when called at 23:01 UTC on Dec 31", async () => {
    // 2026-12-31 23:01 UTC = 2027-01-01 00:01 CET — payment in new year
    // Use toFake only for Date so DB timers/promises are not affected
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:01:00Z"));

    const member = await seedMember({ name: "B1RegressionMember" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    await markBeitragPaid(member.id, 2026, null, "admin");

    const row = await getMemberBeitrag(member.id, 2026);
    // With the B1 fix: gezahlt_am = "2027-01-01" (Berlin local)
    // Without the fix: gezahlt_am = "2026-12-31" (UTC slice — wrong)
    expect(row?.gezahltAm).toBe("2027-01-01");
  });

  it("writes correct date at Berlin noon on Dec 31", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T11:00:00Z")); // 12:00 Berlin

    const member = await seedMember({ name: "B1RegressionMemberNoon" });
    await seedOpenBeitrag({ memberId: member.id, year: 2026 });

    await markBeitragPaid(member.id, 2026, null, "admin");

    const row = await getMemberBeitrag(member.id, 2026);
    expect(row?.gezahltAm).toBe("2026-12-31");
  });
});
