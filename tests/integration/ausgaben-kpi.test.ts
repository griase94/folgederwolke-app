/**
 * Phase 4 / Task 1 — listAusgabenKpi aggregation.
 *
 * Powers the Ausgaben list header pill "N offen · älteste X Tage" (spec §7.1).
 * Asserts total+count+offen+oldest-open-age against the seeded showcase corpus
 * (scripts/seed-fixtures.ts → seedTransactionCorpus), with PINNED values (not
 * just typeof/>0) so the offen-predicate, its exclusions, year-scoping, the
 * empty-open-set path, and the approvedAt aging basis are all actually proven.
 *
 * OPEN = approvedAt IS NOT NULL AND erstattetAm IS NULL AND rejectedAt IS NULL.
 * Deterministic corpus facts (scripts/seed-fixtures.ts):
 *   - 10 expenses seeded; 4 in 2026 (A-2026-907..910), 2 in 2024, 4 in 2025.
 *   - The ONLY open row is A-2025-905 (approvedAt 2025-01-25, never erstattet,
 *     not rejected). Excluded non-open rows that could be miscounted:
 *       · A-2025-904 — approvedAt set BUT erstattetAm set  (already reimbursed)
 *       · A-2025-906 — rejectedAt set                      (abgelehnt)
 *       · A-2026-908/909 — geprueft but approvedAt NULL     (no approval stamp)
 *   - 2026 has NO row with approvedAt → offenCount 0, oldestOpenAgeDays null.
 *
 * `count`/`totalCents` are asserted as a corpus FLOOR (>=), not an exact equal:
 * `listAusgabenKpi` aggregates EVERY expense in scope, and sibling reset-lane
 * test files (e.g. markExpenseAsPaid) seed their own AUS-* expenses that can
 * still be present when this file runs in the shared single-fork DB. The
 * load-bearing offen-predicate / aging assertions key on approvedAt + erstattetAm
 * + rejectedAt, which those sibling seeds never leave in the open state, so
 * THOSE stay exact.
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
  it("2026 scope: >=4 expenses, ZERO open (no 2026 row carries an approvedAt) → null age", async () => {
    const kpi = await listAusgabenKpi(2026);
    // At least the four A-2026-9xx corpus rows are in scope.
    expect(kpi.count).toBeGreaterThanOrEqual(4);
    expect(kpi.totalCents).toBeGreaterThan(0);
    // None of the 2026 corpus rows has approvedAt → the offen-predicate matches
    // none, and the empty-open-set path returns null (not 0, not a stale date).
    expect(kpi.offenCount).toBe(0);
    expect(kpi.oldestOpenAgeDays).toBeNull();
  });

  it("ALL_YEARS scope: exactly ONE open row (erstattet + rejected + unapproved all excluded)", async () => {
    const kpi = await listAusgabenKpi(ALL_YEARS);
    // At least every seeded corpus expense across all years.
    expect(kpi.count).toBeGreaterThanOrEqual(10);
    expect(kpi.totalCents).toBeGreaterThan(0);
    // THE offen-predicate proof: only A-2025-905 qualifies. If the predicate
    // wrongly counted the approved-but-erstattet (904), the rejected (906), or
    // the unapproved geprueft rows, this would exceed 1.
    expect(kpi.offenCount).toBe(1);
    // Aging basis is approvedAt (2025-01-25), NOT gebuchtAm/createdAt — the age
    // is well over a year, so a generous lower bound proves it isn't a recent
    // (e.g. createdAt = seed-time) basis.
    expect(kpi.oldestOpenAgeDays).not.toBeNull();
    expect(kpi.oldestOpenAgeDays!).toBeGreaterThan(400);
  });

  it("year scope strictly narrows the aggregate (ALL_YEARS dominates 2026)", async () => {
    const all = await listAusgabenKpi(ALL_YEARS);
    const y2026 = await listAusgabenKpi(2026);
    // >=10 vs >=4 — a no-op year filter would make these equal.
    expect(all.count).toBeGreaterThan(y2026.count);
    expect(all.totalCents).toBeGreaterThanOrEqual(y2026.totalCents);
  });
});
