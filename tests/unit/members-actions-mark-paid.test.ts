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

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { getMemberBeitrag } from "../helpers/queries.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";

const TEST_YEAR = 2026;

describe("@phase-0 markBeitragPaid — B1 Berlin-date regression (named-args)", () => {
  it("stores the caller-provided gezahltAm (Berlin new-year date)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const member = await seedMember({ name: "B1RegressionMember" });
    await seedOpenBeitrag({ memberId: member.id, year: TEST_YEAR });

    // Route action would call berlinYmd() at 23:01 UTC on Dec 31 → "2027-01-01"
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
