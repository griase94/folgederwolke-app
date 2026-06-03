/**
 * @vitest-environment node
 * @phase-c3
 *
 * Tests for the cashflow-overview extensions to `src/lib/server/domain/dashboard.ts`.
 *
 * Adds to the existing dashboard module:
 *   - `loadDashboardKpis(year: number)` — accepts a year parameter (year-switcher contract)
 *   - `cashflow: { einnahmenYtdCents, ausgabenYtdCents,
 *       einnahmenMonthlyCents: number[12], ausgabenMonthlyCents: number[12],
 *       einnahmenLyYtdCents, ausgabenLyYtdCents,
 *       saldoCents, openInvoicesCount, year }`
 *   - `computeLyDeltaPct(cur, prev)` pure helper (mirrors LargeKpiCard logic)
 *   - `bucketByMonth(rows)` pure helper
 *
 * Most DB-bound tests live in e2e; here we mock the DB and test the
 * shape + math.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- DB mock ---------------------------------------------------------------
// Drizzle queries are chained: .from(...).where(...).groupBy(...). We can't
// fully fake the chain; instead we capture what the module asks for and
// return a series of arrays per query.

const queryResults: unknown[][] = [];
let queryIdx = 0;

function makeQueryChain() {
  // Each leaf returns the next result.
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      // `then` triggers when awaited; resolve with the next result.
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => {
          const res = queryResults[queryIdx++] ?? [];
          resolve(res);
        };
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    select: () => makeQueryChain(),
  }),
}));

// Pass-through stubs for drizzle ops the module uses.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  count: (col?: unknown) => ({ op: "count", col }),
  desc: (col: unknown) => ({ op: "desc", col }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  gte: (col: unknown, val: unknown) => ({ op: "gte", col, val }),
  isNull: (col: unknown) => ({ op: "isNull", col }),
  isNotNull: (col: unknown) => ({ op: "isNotNull", col }),
  gt: (col: unknown, val: unknown) => ({ op: "gt", col, val }),
  lt: (col: unknown, val: unknown) => ({ op: "lt", col, val }),
  lte: (col: unknown, val: unknown) => ({ op: "lte", col, val }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: "sql",
    strings,
    values,
  }),
  sum: (col: unknown) => ({ op: "sum", col }),
}));

// ---------------------------------------------------------------------------
// pure helper tests
// ---------------------------------------------------------------------------

describe("computeLyDeltaPct", () => {
  it("returns +50 for a 50% increase", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    expect(computeLyDeltaPct(1500000, 1000000)).toBe(50);
  });

  it("returns -25 for a 25% decrease", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    expect(computeLyDeltaPct(750000, 1000000)).toBe(-25);
  });

  it("returns null when previous is zero (avoid div-by-zero)", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    expect(computeLyDeltaPct(1500000, 0)).toBeNull();
  });

  it("returns null when previous is negative (defensive)", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    expect(computeLyDeltaPct(1500000, -100)).toBeNull();
  });

  it("returns 0 when values are equal", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    expect(computeLyDeltaPct(1000, 1000)).toBe(0);
  });

  it("rounds to nearest integer", async () => {
    const { computeLyDeltaPct } =
      await import("$lib/server/domain/dashboard.js");
    // 1234/1000 → 23.4 → 23
    expect(computeLyDeltaPct(1234, 1000)).toBe(23);
  });
});

describe("bucketByMonth", () => {
  it("places amounts in their 0-indexed month bucket", async () => {
    const { bucketByMonth } = await import("$lib/server/domain/dashboard.js");
    const rows = [
      { month: 1, sumCents: 1000 }, // Jan → idx 0
      { month: 3, sumCents: 3000 }, // Mar → idx 2
      { month: 12, sumCents: 12000 }, // Dec → idx 11
    ];
    const result = bucketByMonth(rows);
    expect(result.length).toBe(12);
    expect(result[0]).toBe(1000);
    expect(result[2]).toBe(3000);
    expect(result[11]).toBe(12000);
    // Empty months are zero.
    expect(result[1]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it("returns array of 12 zeros when given no rows", async () => {
    const { bucketByMonth } = await import("$lib/server/domain/dashboard.js");
    const result = bucketByMonth([]);
    expect(result.length).toBe(12);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("coerces bigint and string sums to number", async () => {
    const { bucketByMonth } = await import("$lib/server/domain/dashboard.js");
    const rows = [
      { month: 1, sumCents: BigInt(5000) },
      { month: 2, sumCents: "12345" },
    ];
    const result = bucketByMonth(rows);
    expect(result[0]).toBe(5000);
    expect(result[1]).toBe(12345);
  });

  it("sums duplicate months (defensive)", async () => {
    const { bucketByMonth } = await import("$lib/server/domain/dashboard.js");
    const rows = [
      { month: 1, sumCents: 1000 },
      { month: 1, sumCents: 500 },
    ];
    const result = bucketByMonth(rows);
    expect(result[0]).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// loadDashboardKpis(year) — mocked DB query order tests
// ---------------------------------------------------------------------------

describe("loadDashboardKpis(year)", () => {
  beforeEach(() => {
    queryIdx = 0;
    queryResults.length = 0;
  });

  it("accepts a year argument and returns a cashflow block", async () => {
    // dashboard.loadDashboardKpis issues a fixed sequence of selects. We
    // supply harmless empty arrays / zero counts in order. After C3-1
    // (cycle 2) the sequence now spans 15 queries:
    //
    //   1. openAuslagen.count
    //   2. approvedNotErstattet (count, sum)
    //   3. openBeitragsAgg
    //   4. spendenYtd
    //   5. activeMembers
    //   6. wgbEinnahmen
    //   7. income monthly (current year, sphereSnapshot grouped)
    //   8. donations monthly
    //   9. beitrags monthly (paidCents bucketed by gezahlt_am)
    //  10. expenses monthly
    //  11. income LY YTD
    //  12. donations LY YTD
    //  13. beitrags LY YTD
    //  14. expenses LY YTD
    //  15. open invoices count
    queryResults.push(
      [{ value: 0 }], // 1
      [{ cnt: 0, sumCents: 0 }], // 2
      [{ rowCount: 0, memberCount: 0 }], // 3
      [{ sumCents: 0 }], // 4
      [{ value: 0 }], // 5
      [{ sumCents: 0 }], // 6
      [
        { month: 1, sumCents: 1000 },
        { month: 6, sumCents: 5000 },
        { month: 12, sumCents: 9000 },
      ], // 7 income monthly
      [], // 8 donations monthly (empty for legacy test parity)
      [], // 9 beitrags monthly (empty)
      [
        { month: 1, sumCents: 500 },
        { month: 6, sumCents: 2500 },
        { month: 12, sumCents: 4500 },
      ], // 10 expenses monthly
      [{ sumCents: 12000 }], // 11 income LY YTD
      [{ sumCents: 0 }], // 12 donations LY YTD
      [{ sumCents: 0 }], // 13 beitrags LY YTD
      [{ sumCents: 6000 }], // 14 expenses LY YTD
      [{ value: 3 }], // 15 open invoices
      [], // 16 income by sphere
      [], // 17 donations by sphere
      [], // 18 expenses by sphere
      [{ sumCents: 0 }], // 19 beitrags YTD aggregate
    );

    const mod = await import("$lib/server/domain/dashboard.js");
    const result = await mod.loadDashboardKpis(2024);

    expect(result.cashflow.year).toBe(2024);
    expect(result.cashflow.einnahmenYtdCents).toBe(15000); // 1000+5000+9000
    expect(result.cashflow.ausgabenYtdCents).toBe(7500); // 500+2500+4500
    expect(result.cashflow.einnahmenLyYtdCents).toBe(12000);
    expect(result.cashflow.ausgabenLyYtdCents).toBe(6000);
    expect(result.cashflow.saldoCents).toBe(15000 - 7500);
    expect(result.cashflow.openInvoicesCount).toBe(3);
    expect(result.cashflow.einnahmenMonthlyCents.length).toBe(12);
    expect(result.cashflow.ausgabenMonthlyCents.length).toBe(12);
    expect(result.cashflow.einnahmenMonthlyCents[0]).toBe(1000);
    expect(result.cashflow.einnahmenMonthlyCents[5]).toBe(5000);
    expect(result.cashflow.einnahmenMonthlyCents[11]).toBe(9000);
    // C3-3 — sphere splits initialized to zero per key (defensive shape)
    expect(result.cashflow.einnahmenBySphereCents.ideeller).toBe(0);
    expect(result.cashflow.ausgabenBySphereCents.ideeller).toBe(0);
  });

  it("defaults to current Berlin year when no arg is given", async () => {
    queryResults.push(
      [{ value: 0 }],
      [{ cnt: 0, sumCents: 0 }],
      [{ rowCount: 0, memberCount: 0 }],
      [{ sumCents: 0 }],
      [{ value: 0 }],
      [{ sumCents: 0 }],
      [], // einnahmen monthly empty (income)
      [], // donations monthly empty
      [], // beitrags monthly empty
      [], // ausgaben monthly empty
      [{ sumCents: 0 }], // income LY
      [{ sumCents: 0 }], // donations LY
      [{ sumCents: 0 }], // beitrags LY
      [{ sumCents: 0 }], // expenses LY
      [{ value: 0 }], // open invoices
      [], // income by sphere
      [], // donations by sphere
      [], // expenses by sphere
      [{ sumCents: 0 }], // beitrags YTD aggregate
    );

    const mod = await import("$lib/server/domain/dashboard.js");
    const result = await mod.loadDashboardKpis();
    // Berlin year for "now" is computed inside the helper; we just check it
    // returned a sensible 4-digit year and the call didn't throw.
    expect(result.cashflow.year).toBeGreaterThanOrEqual(2024);
    expect(result.cashflow.einnahmenMonthlyCents.length).toBe(12);
  });

  // -------------------------------------------------------------------------
  // C3-1 (cycle 2) — Einnahmen must union income + donations + member_beitrags
  // -------------------------------------------------------------------------
  it("unions Spenden + Mitgliedsbeiträge into Einnahmen YTD + monthly + LY (C3-1)", async () => {
    // Query order with C3-1 fix:
    //   1. openAuslagen
    //   2. approvedNotErstattet
    //   3. openBeitragsAgg
    //   4. spendenYtd
    //   5. activeMembers
    //   6. wgbEinnahmen
    //   7. einnahmen monthly (income table)
    //   8. donations monthly
    //   9. beitrags monthly (gezahlt_am buckets)
    //  10. ausgaben monthly
    //  11. einnahmen LY YTD (income)
    //  12. donations LY YTD
    //  13. beitrags LY YTD
    //  14. ausgaben LY YTD
    //  15. open invoices count
    queryResults.push(
      [{ value: 0 }],
      [{ cnt: 0, sumCents: 0 }],
      [{ rowCount: 0, memberCount: 0 }],
      [{ sumCents: 0 }],
      [{ value: 0 }],
      [{ sumCents: 0 }],
      [{ month: 1, sumCents: 1000 }], // income monthly
      [{ month: 1, sumCents: 200 }], // donations monthly
      [{ month: 1, sumCents: 500 }], // beitrags monthly
      [{ month: 1, sumCents: 100 }], // expenses monthly
      [{ sumCents: 9000 }], // income LY
      [{ sumCents: 2000 }], // donations LY
      [{ sumCents: 1000 }], // beitrags LY
      [{ sumCents: 6000 }], // expenses LY
      [{ value: 0 }], // open invoices
      [], // income by sphere
      [], // donations by sphere
      [], // expenses by sphere
      [{ sumCents: 500 }], // beitrags YTD aggregate (for sphere split)
    );
    const mod = await import("$lib/server/domain/dashboard.js");
    const result = await mod.loadDashboardKpis(2024);
    // Einnahmen sums all 3 income sources
    expect(result.cashflow.einnahmenYtdCents).toBe(1000 + 200 + 500);
    expect(result.cashflow.einnahmenLyYtdCents).toBe(9000 + 2000 + 1000);
    // Monthly bucket Jan also sums all three
    expect(result.cashflow.einnahmenMonthlyCents[0]).toBe(1000 + 200 + 500);
    // Saldo inherits the union total
    expect(result.cashflow.saldoCents).toBe(1700 - 100);
    // Ausgaben unchanged
    expect(result.cashflow.ausgabenYtdCents).toBe(100);
    expect(result.cashflow.ausgabenLyYtdCents).toBe(6000);
  });

  // -------------------------------------------------------------------------
  // C3-3 (cycle 2) — sphere split surfaces all 4 spheres with proper sums
  // -------------------------------------------------------------------------
  it("returns per-sphere YTD breakdown for both einnahmen + ausgaben (C3-3)", async () => {
    queryResults.push(
      [{ value: 0 }],
      [{ cnt: 0, sumCents: 0 }],
      [{ rowCount: 0, memberCount: 0 }],
      [{ sumCents: 0 }],
      [{ value: 0 }],
      [{ sumCents: 0 }],
      [], // income monthly
      [], // donations monthly
      [], // beitrags monthly
      [], // expenses monthly
      [{ sumCents: 0 }], // income LY
      [{ sumCents: 0 }], // donations LY
      [{ sumCents: 0 }], // beitrags LY
      [{ sumCents: 0 }], // expenses LY
      [{ value: 0 }], // open invoices
      // Income by sphere: zweckbetrieb 1000, wirtschaftlich 2000
      [
        { sphere: "zweckbetrieb", sumCents: 1000 },
        { sphere: "wirtschaftlich", sumCents: 2000 },
      ],
      // Donations by sphere: ideeller 5000
      [{ sphere: "ideeller", sumCents: 5000 }],
      // Expenses by sphere: ideeller 100, zweckbetrieb 200
      [
        { sphere: "ideeller", sumCents: 100 },
        { sphere: "zweckbetrieb", sumCents: 200 },
      ],
      [{ sumCents: 750 }], // beitrags YTD agg (always ideeller)
    );
    const mod = await import("$lib/server/domain/dashboard.js");
    const result = await mod.loadDashboardKpis(2024);

    const { einnahmenBySphereCents: e, ausgabenBySphereCents: a } =
      result.cashflow;
    // Einnahmen: income + donations + beitrags(ideeller)
    expect(e.ideeller).toBe(5000 + 750);
    expect(e.zweckbetrieb).toBe(1000);
    expect(e.wirtschaftlich).toBe(2000);
    expect(e.vermoegen).toBe(0);
    // Ausgaben: expenses only
    expect(a.ideeller).toBe(100);
    expect(a.zweckbetrieb).toBe(200);
    expect(a.wirtschaftlich).toBe(0);
    expect(a.vermoegen).toBe(0);
  });
});
