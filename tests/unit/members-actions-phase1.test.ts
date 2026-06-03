/**
 * Task 1.6: refactored markBeitragPaid (named-args, reads Satz from DB),
 * new markBeitragUnpaid, new setBeitragExempt — with audit events.
 *
 * TDD: tests written first, implementation follows.
 *
 * @phase-1
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { getMemberBeitrag } from "../helpers/queries.js";

import {
  markBeitragPaid,
  markBeitragUnpaid,
  setBeitragExempt,
} from "$lib/server/domain/members-actions.js";

const TEST_YEAR = 2026;
const ACTOR_ID = "00000000-0000-4000-8000-000000000099";

afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// markBeitragPaid — refactored named-args signature
// ---------------------------------------------------------------------------

describe("@phase-1 markBeitragPaid (Task 1.6 refactor)", () => {
  it("marks a row paid using year Satz from beitragssatz_by_year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "MarkPaidSatzTest" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.paidCents).toBe(6969n);
    expect(row?.gezahltAm).toBe("2026-03-15");
  });

  it("creates a new row if none exists, using Satz from DB", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "MarkPaidNoRowTest" });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-04-01",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.betragCents).toBe(6969n);
    expect(row?.paidCents).toBe(6969n);
    expect(row?.gezahltAm).toBe("2026-04-01");
  });

  it("rejects non-admin roles", async () => {
    const m = await seedMember({ name: "MarkPaidRoleTest" });
    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      actorUserId: ACTOR_ID,
      actorRole: "member_self_service",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(403);
  });

  it("uses gezahltAm explicitly (no server-side defaulting)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "MarkPaidExplicitDate" });
    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2025-12-01", // explicit past date
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });
    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.gezahltAm).toBe("2025-12-01");
  });
});

// ---------------------------------------------------------------------------
// markBeitragUnpaid
// ---------------------------------------------------------------------------

describe("@phase-1 markBeitragUnpaid (Task 1.6 new)", () => {
  it("sets paidCents=0 and gezahltAm=null on an existing paid row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "MarkUnpaidTest" });
    // First mark paid
    await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    // Now mark unpaid
    const result = await markBeitragUnpaid({
      memberId: m.id,
      year: TEST_YEAR,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.paidCents).toBe(0n);
    expect(row?.gezahltAm).toBeNull();
  });

  it("returns 404 if no row exists", async () => {
    const m = await seedMember({ name: "MarkUnpaidNoRowTest" });
    const result = await markBeitragUnpaid({
      memberId: m.id,
      year: TEST_YEAR,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(404);
  });

  it("rejects non-admin roles", async () => {
    const m = await seedMember({ name: "MarkUnpaidRoleTest" });
    const result = await markBeitragUnpaid({
      memberId: m.id,
      year: TEST_YEAR,
      actorUserId: ACTOR_ID,
      actorRole: "steuerberater",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// setBeitragExempt
// ---------------------------------------------------------------------------

describe("@phase-1 setBeitragExempt (Task 1.6 new)", () => {
  it("sets is_exempt=true with reason on a new row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "SetExemptNewRow" });

    const result = await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      reason: "Härtefall",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.isExempt).toBe(true);
    expect(row?.exemptReason).toBe("Härtefall");
  });

  it("sets is_exempt=false (clear exemption)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "SetExemptClearTest" });

    // First set exempt
    await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      reason: "Test",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    // Then clear
    const result = await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: false,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.isExempt).toBe(false);
    // Reason is cleared when revoking
    expect(row?.exemptReason).toBeNull();
  });

  it("returns 400 when exempt=true but reason is empty", async () => {
    const m = await seedMember({ name: "SetExemptNoReason" });
    const result = await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      reason: "  ",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
  });

  it("returns 400 when exempt=true but reason is missing", async () => {
    const m = await seedMember({ name: "SetExemptMissingReason" });
    const result = await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(400);
  });

  it("rejects non-admin roles", async () => {
    const m = await seedMember({ name: "SetExemptRoleTest" });
    const result = await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      reason: "Test",
      actorUserId: ACTOR_ID,
      actorRole: "member_self_service",
    });
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(403);
  });

  it("trims the reason before storing", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "SetExemptTrimReason" });

    await setBeitragExempt({
      memberId: m.id,
      year: TEST_YEAR,
      exempt: true,
      reason: "  Härtefall  ",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.exemptReason).toBe("Härtefall");
  });
});
