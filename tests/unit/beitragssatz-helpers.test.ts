/**
 * Task 1.5: getBeitragssatz + getFaelligkeit lookup helpers.
 *
 * TDD: tests written first, implementation follows.
 *
 * @phase-1
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";

import {
  getBeitragssatz,
  getFaelligkeit,
} from "$lib/server/domain/beitragssatz.js";

const TEST_YEAR_SATZ = 2096; // far future — unlikely to conflict

describe("@phase-1 getBeitragssatz (Task 1.5)", () => {
  it("returns cents for the requested year", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR_SATZ, cents: 6969n })
      .onConflictDoNothing();

    const cents = await getBeitragssatz(TEST_YEAR_SATZ);
    expect(cents).toBe(6969n);
  });

  it("returns bigint type", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: TEST_YEAR_SATZ, cents: 6969n })
      .onConflictDoNothing();

    const cents = await getBeitragssatz(TEST_YEAR_SATZ);
    expect(typeof cents).toBe("bigint");
  });

  it("throws explicit error if year is missing", async () => {
    await expect(getBeitragssatz(9998)).rejects.toThrow(/No Beitragssatz/);
  });
});

describe("@phase-1 getFaelligkeit (Task 1.5)", () => {
  it("returns faelligkeit_at when explicitly set", async () => {
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({
        year: TEST_YEAR_SATZ,
        cents: 6969n,
        faelligkeitAt: `${TEST_YEAR_SATZ}-05-31`,
      })
      .onConflictDoUpdate({
        target: [beitragssatzByYear.year],
        set: { faelligkeitAt: `${TEST_YEAR_SATZ}-05-31` },
      });

    const due = await getFaelligkeit(TEST_YEAR_SATZ);
    // The returned date should be the 31st of May in TEST_YEAR_SATZ
    expect(due).toBeInstanceOf(Date);
    // Date parsing: the string '2096-05-31' from postgres may come as a date string
    // We compare year/month/day
    const d = due instanceof Date ? due : new Date(due as unknown as string);
    expect(d.getUTCFullYear()).toBe(TEST_YEAR_SATZ);
    expect(d.getUTCMonth()).toBe(4); // May = 4 (0-indexed)
    expect(d.getUTCDate()).toBe(31);
  });

  it("defaults to March 31 when faelligkeit_at is null", async () => {
    const YEAR_NO_DUE = 2097;
    const db = getDb();
    await db
      .insert(beitragssatzByYear)
      .values({ year: YEAR_NO_DUE, cents: 6969n, faelligkeitAt: null })
      .onConflictDoNothing();

    const due = await getFaelligkeit(YEAR_NO_DUE);
    expect(due).toBeInstanceOf(Date);
    const d = due instanceof Date ? due : new Date(due as unknown as string);
    expect(d.getUTCMonth()).toBe(2); // March = 2 (0-indexed)
    expect(d.getUTCDate()).toBe(31);
  });

  it("throws explicit error if year is missing", async () => {
    await expect(getFaelligkeit(9997)).rejects.toThrow(/No Beitragssatz/);
  });
});
