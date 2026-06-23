/**
 * F8 — future-Buchungsjahr write guard.
 *
 * markBeitragPaid / markBeitragPaidBulk / setBeitragExempt must reject a year
 * beyond the current Berlin Buchungsjahr, so cash/exemption can't be booked
 * into a fiscal year that hasn't begun (the matrix used to expose a 2027 column
 * in 2026 and let it be marked paid).
 *
 * @vitest-environment node
 * @phase-3
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { getMemberBeitrag } from "../helpers/queries.js";
import { seedMember } from "../helpers/db-seed.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";
import {
  markBeitragPaid,
  markBeitragPaidBulk,
  setBeitragExempt,
  FUTURE_YEAR_ERROR,
} from "$lib/server/domain/members-actions.js";

const FUTURE_YEAR = currentBuchungsjahr() + 1;
const CURRENT_YEAR = currentBuchungsjahr();

describe("@phase-3 future-Buchungsjahr write guard (F8)", () => {
  it("markBeitragPaid rejects a future year with 422 and writes nothing", async () => {
    const db = getDb();
    // A real Satz exists for the future year (migration 0026 seeds +1), so the
    // rejection must come from the year guard, NOT from a missing Satz.
    await db
      .insert(beitragssatzByYear)
      .values({ year: FUTURE_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const member = await seedMember({ name: "FutureYearMember" });

    const result = await markBeitragPaid({
      memberId: member.id,
      year: FUTURE_YEAR,
      gezahltAm: `${FUTURE_YEAR}-03-31`,
      actorUserId: null,
      actorRole: "admin",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toBe(FUTURE_YEAR_ERROR);
    }
    // No row created for the future year.
    const row = await getMemberBeitrag(member.id, FUTURE_YEAR);
    expect(row).toBeUndefined();
  });

  it("markBeitragPaid still accepts the current year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: CURRENT_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const member = await seedMember({ name: "CurrentYearMember" });
    const result = await markBeitragPaid({
      memberId: member.id,
      year: CURRENT_YEAR,
      gezahltAm: `${CURRENT_YEAR}-03-31`,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(result.ok).toBe(true);
  });

  it("markBeitragPaidBulk skips future-year members (delegates to the guard)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: FUTURE_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m1 = await seedMember({ name: "BulkFuture1" });
    const m2 = await seedMember({ name: "BulkFuture2" });

    const result = await markBeitragPaidBulk({
      memberIds: [m1.id, m2.id],
      year: FUTURE_YEAR,
      gezahltAm: `${FUTURE_YEAR}-03-31`,
      actorUserId: null,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.paidCount).toBe(0);
      expect(result.skipped).toHaveLength(2);
      expect(result.skipped[0]?.error).toBe(FUTURE_YEAR_ERROR);
    }
  });

  it("setBeitragExempt rejects a future year with 422", async () => {
    const member = await seedMember({ name: "FutureExemptMember" });
    const result = await setBeitragExempt({
      memberId: member.id,
      year: FUTURE_YEAR,
      exempt: true,
      reason: "Test",
      actorUserId: null,
      actorRole: "admin",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toBe(FUTURE_YEAR_ERROR);
    }
  });
});
