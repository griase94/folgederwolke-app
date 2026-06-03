/**
 * Task 1.4: year-row materializer — idempotent row creation for all active
 * members for a given year, reading the Beitragssatz from beitragssatz_by_year.
 *
 * TDD: tests written first, implementation follows.
 *
 * @phase-1
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { seedMember, seedOpenBeitrag } from "../helpers/db-seed.js";
import { and, eq } from "drizzle-orm";

// Module under test — imported lazily after tests are defined to allow
// vi.useFakeTimers() to work in other tests in this suite if needed.
import { materializeYearRows } from "$lib/server/domain/year-row-materializer.js";

// Use a far-future year that test seeding is unlikely to have touched yet,
// to avoid cross-test contamination.
const TEST_YEAR = 2099;

describe("@phase-1 materializeYearRows (Task 1.4)", () => {
  it("creates rows for all active members for the given year", async () => {
    const db = getDb();

    // Seed a beitragssatz for TEST_YEAR
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // Seed a fresh active member
    const m = await seedMember({
      name: "MaterializerTestA",
      eintrittsDatum: "2020-01-01",
    });

    const created = await materializeYearRows(TEST_YEAR);

    // At least 1 row created (for our seeded member)
    expect(created).toBeGreaterThanOrEqual(1);

    // Verify the row exists for our member
    const rows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, m.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0]?.betragCents).toBe(6969n);
    expect(rows[0]?.paidCents).toBe(0n);
  });

  it("is idempotent — second call creates 0 rows", async () => {
    const db = getDb();

    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // First call
    await materializeYearRows(TEST_YEAR);
    // Second call must not create duplicates
    const created2 = await materializeYearRows(TEST_YEAR);
    expect(created2).toBe(0);
  });

  it("skips members who joined after Dec 31 of the year", async () => {
    const db = getDb();

    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // Member who joins in year after TEST_YEAR
    const future = await seedMember({
      name: "MaterializerFuture2099",
      eintrittsDatum: `${TEST_YEAR + 1}-01-01`,
    });

    await materializeYearRows(TEST_YEAR);

    const rows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, future.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );
    expect(rows.length).toBe(0);
  });

  it("skips members who left before Jan 1 of the year", async () => {
    const db = getDb();

    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    // Member who left the year before TEST_YEAR
    const past = await seedMember({
      name: "MaterializerPast2099",
      austrittsDatum: `${TEST_YEAR - 1}-12-31`,
    });

    await materializeYearRows(TEST_YEAR);

    const rows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, past.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );
    expect(rows.length).toBe(0);
  });

  it("uses the year's Beitragssatz from beitragssatz_by_year", async () => {
    const db = getDb();

    const CUSTOM_YEAR = 2098;
    const CUSTOM_CENTS = 8000n;

    // Insert a custom Satz for this year
    await db
      .insert(beitragssatzByYear)
      .values({ year: CUSTOM_YEAR, cents: CUSTOM_CENTS })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { cents: CUSTOM_CENTS },
      });

    // Seed an active member
    const m = await seedMember({
      name: "MaterializerCustomSatz",
      eintrittsDatum: "2020-01-01",
    });

    await materializeYearRows(CUSTOM_YEAR);

    const rows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, m.id),
          eq(memberBeitrags.year, CUSTOM_YEAR),
        ),
      );

    expect(rows.length).toBe(1);
    expect(rows[0]?.betragCents).toBe(CUSTOM_CENTS);
  });

  it("throws if no Beitragssatz exists for the year", async () => {
    const MISSING_YEAR = 1800;
    await expect(materializeYearRows(MISSING_YEAR)).rejects.toThrow(
      /No Beitragssatz/,
    );
  });

  it("source is set to 'app' on materialized rows", async () => {
    const db = getDb();

    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR, cents: 6969n })
      .onConflictDoNothing();

    const m = await seedMember({ name: "MaterializerSource" });

    await materializeYearRows(TEST_YEAR);

    const [row] = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, m.id),
          eq(memberBeitrags.year, TEST_YEAR),
        ),
      );

    expect(row?.source).toBe("app");
  });
});
