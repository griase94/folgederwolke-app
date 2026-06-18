/**
 * Package B TDD — markBeitragPaid partial/topup/notes/no-row/missing-satz/no-clobber.
 *
 * CARDINAL RULE: no surface may assert a debt that doesn't exist.
 * Money = integer cents (ADR-0003). Partial payments are stored in paidCents
 * without touching betragCents (no-clobber invariant).
 *
 * @phase-0
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { memberBeitrags } from "$lib/server/db/schema/members.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { getMemberBeitrag } from "../helpers/queries.js";
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";

const TEST_YEAR = 2026;
const ACTOR_ID = "00000000-0000-4000-8000-000000000042";

// ---------------------------------------------------------------------------
// partial payment
// ---------------------------------------------------------------------------

describe("@phase-0 markBeitragPaid — partial payment (Package B)", () => {
  it("stores partial paidCents when paidCents < betragCents", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "PartialPayTest" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-01",
      paidCents: 3000,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.paidCents).toBe(3000n);
    // betragCents must NOT be clobbered
    expect(row?.betragCents).toBe(6000n);
  });

  it("clamps paidCents to betragCents (no overpayment stored)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "PartialClampTest" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-01",
      paidCents: 9999, // over betragCents=6000
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.paidCents).toBe(6000n); // clamped to betragCents
  });

  it("topup: partial then second partial sums correctly", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "TopupTest" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    // First partial payment: 2000
    await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-02-01",
      paidCents: 2000,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    // Second topup: 4000 (total = 6000 = betragCents → paid)
    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      paidCents: 4000,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.paidCents).toBe(4000n); // overwrites to the new value (caller decides)
  });
});

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

describe("@phase-0 markBeitragPaid — notes (Package B)", () => {
  it("stores notes on a new row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "NotesNewRowTest" });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-04-01",
      notes: "Barzahlung beim Vereinsfest",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);

    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.notes).toBe("Barzahlung beim Vereinsfest");
  });

  it("updates notes on an existing row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "NotesUpdateRowTest" });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    // First set a note
    await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-01",
      notes: "Erstnotiz",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    // Update to new note
    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      notes: "Korrigierte Notiz",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.notes).toBe("Korrigierte Notiz");
  });

  it("stores null when notes is omitted", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "NotesNullTest" });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-04-01",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// no-row: markBeitragPaid on a member with NO member_beitrags row
// ---------------------------------------------------------------------------

describe("@phase-0 markBeitragPaid — no-row member (Package B)", () => {
  it("creates a new row with Satz as betragCents when no row exists", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "NoRowPartialTest" });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-05-01",
      paidCents: 3000,
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    expect(row?.betragCents).toBe(6969n); // Satz
    expect(row?.paidCents).toBe(3000n);
  });
});

// ---------------------------------------------------------------------------
// missing-Satz 422
// ---------------------------------------------------------------------------

describe("@phase-0 markBeitragPaid — missing-Satz 422 (Package B)", () => {
  it("returns 422 when no Beitragssatz is configured for the year and no row exists", async () => {
    const FUTURE_YEAR = 2099; // guaranteed not configured in test DB
    const m = await seedMember({ name: "MissingSatzTest" });

    const result = await markBeitragPaid({
      memberId: m.id,
      year: FUTURE_YEAR,
      gezahltAm: "2099-03-01",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// no-clobber: existing betragCents must survive an update
// ---------------------------------------------------------------------------

describe("@phase-0 markBeitragPaid — no-clobber betragCents (Package B)", () => {
  it("preserves existing betragCents when row already exists (no clobber with Satz)", async () => {
    const db = getDb();
    // Satz = 6000
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "NoClobberTest" });
    // Existing row has betragCents = 5000 (e.g. a reduced rate agreed individually)
    await db.insert(memberBeitrags).values({
      memberId: m.id,
      year: TEST_YEAR,
      betragCents: 5000n,
      paidCents: 0n,
    });

    // markBeitragPaid should pay the EXISTING betragCents (5000), not the Satz (6000)
    const result = await markBeitragPaid({
      memberId: m.id,
      year: TEST_YEAR,
      gezahltAm: "2026-03-15",
      actorUserId: ACTOR_ID,
      actorRole: "admin",
    });

    expect(result.ok).toBe(true);
    const row = await getMemberBeitrag(m.id, TEST_YEAR);
    // betragCents must be 5000, not 6000 (Satz must NOT clobber)
    expect(row?.betragCents).toBe(5000n);
    // paidCents must equal betragCents (full payment)
    expect(row?.paidCents).toBe(5000n);
  });
});
