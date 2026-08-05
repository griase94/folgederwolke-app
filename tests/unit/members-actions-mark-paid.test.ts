/**
 * B1 regression: markBeitragPaid stores the caller-provided gezahltAm date.
 *
 * Phase 1 refactor: gezahltAm is now an explicit named arg — no server-side
 * defaulting in the domain function itself. The route action is responsible
 * for calling berlinYmd() and passing it in.
 *
 * This test verifies that whatever date the caller provides is stored faithfully.
 *
 * @phase-0
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { getMemberBeitrag } from "../helpers/queries.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";

const TEST_YEAR = 2026;

describe("@phase-0 markBeitragPaid — B1 Berlin-date regression (named-args)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores the caller-provided gezahltAm (Berlin new-year date)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const member = await seedMember({ name: "B1RegressionMember" });
    await seedOpenBeitrag({ memberId: member.id, year: TEST_YEAR });

    // Stand at the instant this case is about: 23:01 UTC on Dec 31 is already
    // 00:01 on Jan 1 in Berlin, so the route's berlinYmd() yields "2027-01-01".
    // The clock has to actually BE there — since S2 the payment date decides
    // the Buchungsjahr, and a "2027-01-01" payment judged against a wall clock
    // still in 2026 is a future booking, which markBeitragPaid rightly refuses.
    // Only Date is faked; the postgres driver's timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:01:00Z"));

    await markBeitragPaid({
      memberId: member.id,
      year: TEST_YEAR,
      gezahltAm: "2027-01-01",
      actorUserId: null,
      actorRole: "admin",
    });

    const row = await getMemberBeitrag(member.id, TEST_YEAR);
    expect(row?.gezahltAm).toBe("2027-01-01");
  });

  it("stores the caller-provided gezahltAm (Berlin noon on Dec 31)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const member = await seedMember({ name: "B1RegressionMemberNoon" });
    await seedOpenBeitrag({ memberId: member.id, year: TEST_YEAR });

    // Route action would call berlinYmd() at 11:00 UTC → "2026-12-31"
    await markBeitragPaid({
      memberId: member.id,
      year: TEST_YEAR,
      gezahltAm: "2026-12-31",
      actorUserId: null,
      actorRole: "admin",
    });

    const row = await getMemberBeitrag(member.id, TEST_YEAR);
    expect(row?.gezahltAm).toBe("2026-12-31");
  });
});
