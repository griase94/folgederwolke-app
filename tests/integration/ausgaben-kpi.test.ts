/**
 * Phase 4 / Task 1 — listAusgabenKpi aggregation.
 *
 * Powers the Ausgaben list header pill "N offen · älteste X Tage" (spec §7.1).
 * Asserts total+count+offen+oldest-open-age against the seeded showcase corpus
 * (scripts/seed-fixtures.ts → seedTransactionCorpus).
 *
 * OPEN = approvedAt IS NOT NULL AND erstattetAm IS NULL AND rejectedAt IS NULL.
 * The corpus seeds exactly one such row: A-2025-905 (Felix' aged Bahnfahrt,
 * approvedAt 2025-01-25, not yet erstattet) — so an ALL_YEARS query has a
 * deterministic offenCount >= 1 and a positive oldest-open age in days.
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
  it("returns total sum + count + offen (approved-not-erstattet) count + oldest-open age in days", async () => {
    const kpi = await listAusgabenKpi(2026);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    expect(typeof kpi.offenCount).toBe("number");
    expect(
      kpi.oldestOpenAgeDays === null ||
        typeof kpi.oldestOpenAgeDays === "number",
    ).toBe(true);
    // Corpus sanity: 2026 has expenses, so count + total are positive.
    expect(kpi.count).toBeGreaterThan(0);
    expect(kpi.totalCents).toBeGreaterThan(0);
  });

  it("supports ALL_YEARS (omits the year predicate)", async () => {
    const kpi = await listAusgabenKpi(ALL_YEARS);
    expect(kpi.count).toBeGreaterThanOrEqual(0);
    // The aged-open Auslage (A-2025-905, approvedAt 2025-01-25, not erstattet,
    // not rejected) is the deterministic OPEN row in the corpus.
    expect(kpi.offenCount).toBeGreaterThanOrEqual(1);
    expect(kpi.oldestOpenAgeDays).not.toBeNull();
    expect(kpi.oldestOpenAgeDays!).toBeGreaterThan(0);
    // ALL_YEARS aggregates across every year, so its count/total dominate any
    // single-year scope.
    const kpi2026 = await listAusgabenKpi(2026);
    expect(kpi.count).toBeGreaterThanOrEqual(kpi2026.count);
    expect(kpi.totalCents).toBeGreaterThanOrEqual(kpi2026.totalCents);
  });
});
