/**
 * Package B TDD — ?/send-reminder false-debt 422 guard.
 *
 * CARDINAL RULE: no surface may assert a debt that doesn't exist.
 * The send-reminder action in BOTH mitglieder routes must refuse with 422
 * when the member owes nothing for the year (paid >= betrag, exempt,
 * ausgetreten, or pre_eintritt). VEREIN_BEITRAG_DEFAULT_CENTS must NOT be
 * used to invent a debt for a settled year.
 *
 * These tests exercise the guard logic directly via the server-side helpers
 * (not through HTTP) by calling the shared helper that both routes delegate to.
 *
 * @phase-0
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import {
  seedMember,
  seedPaidBeitrag,
  seedOpenBeitrag,
} from "../helpers/db-seed.js";
import { checkReminderAllowed } from "$lib/server/domain/members-actions.js";

const TEST_YEAR = 2026;

// ---------------------------------------------------------------------------
// checkReminderAllowed — shared guard for send-reminder in both routes
// ---------------------------------------------------------------------------

describe("@phase-0 send-reminder false-debt guard (Package B)", () => {
  it("allows reminder when member has an open (unpaid) beitrag row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({
      name: "ReminderOpenTest",
      email: "open@test.de",
    });
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses 422 when member has PAID the full beitrag for the year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({
      name: "ReminderPaidTest",
      email: "paid@test.de",
    });
    await seedPaidBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });

    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(422);
    expect(result.error).toMatch(
      /bereits bezahlt|owes nothing|nichts schuldet|schon bezahlt/i,
    );
  });

  it("refuses 422 when member is permanently beitrag-exempt", async () => {
    const m = await seedMember({
      name: "ReminderExemptTest",
      email: "exempt@test.de",
      beitragExempt: true,
      beitragExemptReason: "Ehrenamtlich",
    });

    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(422);
  });

  it("refuses 422 when member has a per-year exempt row", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({
      name: "ReminderPerYearExemptTest",
      email: "peryear@test.de",
    });

    // Seed an exempt row (isExempt=true)
    const memberBeitragsModule =
      await import("$lib/server/db/schema/members.js");
    await db.insert(memberBeitragsModule.memberBeitrags).values({
      memberId: m.id,
      year: TEST_YEAR,
      betragCents: 6000n,
      paidCents: 0n,
      isExempt: true,
      exemptReason: "Härtefall",
    });

    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(422);
  });

  it("refuses 422 when member has exited before the beitrag year", async () => {
    const m = await seedMember({
      name: "ReminderAustrittTest",
      email: "austritt@test.de",
      eintrittsDatum: "2018-01-01",
      austrittsDatum: "2023-12-31", // exited in 2023
    });

    // year=2026 > austrittsJahr=2023 → post-austritt, owes nothing
    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(422);
  });

  it("refuses 422 when year is before member's Eintritt", async () => {
    const m = await seedMember({
      name: "ReminderPreEintrittTest",
      email: "preeintritt@test.de",
      eintrittsDatum: "2027-01-01", // joined 2027
    });

    // year=2026 < eintrittsJahr=2027 → pre-eintritt, owes nothing
    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(422);
  });

  it("allows reminder when member is partially paid (still owes a balance)", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6000n })
      .onConflictDoNothing();

    const m = await seedMember({
      name: "ReminderPartialTest",
      email: "partial@test.de",
    });
    // 3000 paid of 6000 — still owes 3000
    await seedOpenBeitrag({ memberId: m.id, year: TEST_YEAR, cents: 6000n });
    // Update to partial payment
    const memberBeitragsModule =
      await import("$lib/server/db/schema/members.js");
    const { eq, and } = await import("drizzle-orm");
    await db
      .update(memberBeitragsModule.memberBeitrags)
      .set({ paidCents: 3000n })
      .where(
        and(
          eq(memberBeitragsModule.memberBeitrags.memberId, m.id),
          eq(memberBeitragsModule.memberBeitrags.year, TEST_YEAR),
        ),
      );

    const result = await checkReminderAllowed({
      memberId: m.id,
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses 422 when member is NOT FOUND", async () => {
    const result = await checkReminderAllowed({
      memberId: "00000000-0000-4000-8000-000000000000",
      year: TEST_YEAR,
    });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(404);
  });
});
