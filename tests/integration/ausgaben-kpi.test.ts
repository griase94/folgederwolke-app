/**
 * Phase 4 / Task 1 — listAusgabenKpi aggregation.
 *
 * Powers the Ausgaben list header pill "N offen · älteste X Tage" (spec §7.1).
 * Asserts total+count+offen+oldest-open-age against the seeded showcase corpus
 * (scripts/seed-fixtures.ts → seedTransactionCorpus) with assertions chosen to
 * be MEANINGFUL yet ROBUST to the shared single-fork DB (globalSetup resets +
 * seeds ONCE, then every reset-lane file runs against that one DB — sibling
 * files like migration-0031 create their own expenses via createExpense, which
 * stamp approvedAt=now()/erstattetAm=null → OPEN rows in the CURRENT year).
 *
 * OPEN = approvedAt IS NOT NULL AND erstattetAm IS NULL AND rejectedAt IS NULL.
 * Leakage-isolation strategy:
 *   - The offen-PREDICATE proof keys on YEAR 2025: createExpense-based sibling
 *     seeds land in the current Buchungsjahr (2026), never 2025, so 2025 stays
 *     corpus-only. Corpus 2025 = A-2025-{903 unapproved, 904 erstattet,
 *     905 OPEN, 906 rejected} → exactly ONE open row (905). This proves the
 *     erstattet/rejected/unapproved EXCLUSIONS without an absolute global count.
 *   - The empty-open-set/null path keys on an EMPTY year (2099): no corpus and
 *     no sibling ever books there, so offenCount 0 / oldestOpenAgeDays null hold.
 *   - count/total use FLOORS (>=) since leakage only adds rows.
 *
 * DB-backed → RESET lane. Skipped when DATABASE_URL/DIRECT_DATABASE_URL unset.
 */
import { describe, it, expect } from "vitest";
import { listAusgabenKpi } from "$lib/server/domain/ausgaben-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("listAusgabenKpi", () => {
  it("offen-predicate (year 2025, corpus-only): exactly ONE open — erstattet/rejected/unapproved excluded", async () => {
    const kpi = await listAusgabenKpi(2025);
    // 2025 is leakage-immune: every createExpense-based sibling reset-lane seed
    // lands in the CURRENT Buchungsjahr (2026), never 2025, so 2025 stays
    // corpus-only — exactly the 4 seeded A-2025-90{3,4,5,6} expenses
    // (24050 + 50000 + 6780 + 13400 = 94230 cents; verified against
    // scripts/seed-fixtures.ts). EXACT assertions (not floors) here so a
    // mis-scoped year filter or a dropped/extra row is caught.
    expect(kpi.count).toBe(4);
    expect(kpi.totalCents).toBe(94230);
    // Only A-2025-905 is open. A wrong predicate that counted the
    // approved-but-erstattet 904, the rejected 906, or the unapproved 903 would
    // push this above 1.
    expect(kpi.offenCount).toBe(1);
    // Aging basis is approvedAt (2025-01-25), NOT gebuchtAm/createdAt — the age
    // is well over a year, so a generous lower bound proves it isn't a recent
    // (e.g. createdAt = seed-time) basis.
    expect(kpi.oldestOpenAgeDays).not.toBeNull();
    expect(kpi.oldestOpenAgeDays!).toBeGreaterThan(400);
  });

  it("empty-open-set path (year 2099, no bookings): offenCount 0 → oldestOpenAgeDays null", async () => {
    const kpi = await listAusgabenKpi(2099);
    expect(kpi.count).toBe(0);
    expect(kpi.offenCount).toBe(0);
    // The MIN(approvedAt)-over-empty-set must surface as null, not 0/NaN/a date.
    expect(kpi.oldestOpenAgeDays).toBeNull();
  });

  it("ALL_YEARS aggregates every year and dominates a single-year scope", async () => {
    const all = await listAusgabenKpi(ALL_YEARS);
    const y2025 = await listAusgabenKpi(2025);
    // Floors (>=) — leakage from sibling reset-lane seeds only adds rows.
    expect(all.count).toBeGreaterThanOrEqual(10);
    expect(all.totalCents).toBeGreaterThan(0);
    // A no-op year filter would make these equal; ALL_YEARS strictly dominates.
    expect(all.count).toBeGreaterThan(y2025.count);
    expect(all.totalCents).toBeGreaterThanOrEqual(y2025.totalCents);
    // At least the corpus open row is always present across all years.
    expect(all.offenCount).toBeGreaterThanOrEqual(1);
  });
});
