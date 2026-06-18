/**
 * @phase-2
 *
 * C1 cycle 1 — EÜR data shape extensions for the tabbed redesign:
 *   - YoY delta (cur vs prior year per sphere, plus total)
 *   - Monthly Überschuss bucket (length-12) for trend strip
 *   - WGB-Freigrenze status (50.000 € wirtschaftlich threshold — JStG 2024)
 *   - Pre-flight checklist before Festschreibung
 *
 * Resolves: VB-001, JB-007, UX-100, UI-002, UI-034 (cycle-1 server-side
 * groundwork that the UI cycles 2-5 build on).
 */

import { describe, it, expect } from "vitest";
import {
  computeYoYDelta,
  computeSphereYoY,
  computeMonthlyOverschuss,
  computeWgbStatus,
  computePreFlight,
  WGB_FREIGRENZE_CENTS,
  type MonthlyRow,
  type SphereTotalsByYear,
} from "$lib/server/eur/index.js";

// ── computeYoYDelta ──────────────────────────────────────────────────────────

describe("computeYoYDelta", () => {
  it("positive growth: cur=12000 prior=10000 → +2000 cents, +20%", () => {
    const out = computeYoYDelta(12000, 10000);
    expect(out.absCents).toBe(2000);
    expect(out.pct).toBe(20);
  });

  it("negative: cur=8000 prior=10000 → -2000 cents, -20%", () => {
    const out = computeYoYDelta(8000, 10000);
    expect(out.absCents).toBe(-2000);
    expect(out.pct).toBe(-20);
  });

  it("prior <= 0 → pct is null but absCents still computed", () => {
    const out = computeYoYDelta(5000, 0);
    expect(out.absCents).toBe(5000);
    expect(out.pct).toBeNull();
  });

  it("prior negative → pct is null (defensive)", () => {
    const out = computeYoYDelta(1000, -500);
    expect(out.absCents).toBe(1500);
    expect(out.pct).toBeNull();
  });

  it("zero current with positive prior → -100%", () => {
    const out = computeYoYDelta(0, 10000);
    expect(out.absCents).toBe(-10000);
    expect(out.pct).toBe(-100);
  });

  it("equal cur and prior → 0 absCents, 0 pct", () => {
    const out = computeYoYDelta(7777, 7777);
    expect(out.absCents).toBe(0);
    expect(out.pct).toBe(0);
  });
});

// ── computeSphereYoY ─────────────────────────────────────────────────────────

describe("computeSphereYoY", () => {
  function makeYear(
    einnahmen: Record<string, number>,
    ausgaben: Record<string, number>,
  ): SphereTotalsByYear {
    const totals: SphereTotalsByYear = {
      ideeller: { einnahmenCents: 0, ausgabenCents: 0, ueberschussCents: 0 },
      vermoegen: { einnahmenCents: 0, ausgabenCents: 0, ueberschussCents: 0 },
      zweckbetrieb: {
        einnahmenCents: 0,
        ausgabenCents: 0,
        ueberschussCents: 0,
      },
      wirtschaftlich: {
        einnahmenCents: 0,
        ausgabenCents: 0,
        ueberschussCents: 0,
      },
    };
    for (const [sphere, cents] of Object.entries(einnahmen)) {
      totals[sphere as keyof SphereTotalsByYear].einnahmenCents = cents;
    }
    for (const [sphere, cents] of Object.entries(ausgaben)) {
      totals[sphere as keyof SphereTotalsByYear].ausgabenCents = cents;
    }
    for (const sphere of Object.keys(totals) as (keyof SphereTotalsByYear)[]) {
      totals[sphere].ueberschussCents =
        totals[sphere].einnahmenCents - totals[sphere].ausgabenCents;
    }
    return totals;
  }

  it("returns 4 rows in stable sphere order", () => {
    const cur = makeYear({ ideeller: 100 }, {});
    const prior = makeYear({}, {});
    const out = computeSphereYoY(cur, prior);
    expect(out.map((r) => r.sphere)).toEqual([
      "ideeller",
      "vermoegen",
      "zweckbetrieb",
      "wirtschaftlich",
    ]);
  });

  it("computes YoY deltas per sphere on Überschuss", () => {
    const cur = makeYear(
      { ideeller: 20000, zweckbetrieb: 50000 },
      { ideeller: 5000, zweckbetrieb: 20000 },
    );
    const prior = makeYear(
      { ideeller: 10000, zweckbetrieb: 40000 },
      { ideeller: 2000, zweckbetrieb: 30000 },
    );
    const out = computeSphereYoY(cur, prior);
    const ideeller = out.find((r) => r.sphere === "ideeller")!;
    // cur Überschuss = 20000-5000 = 15000; prior = 10000-2000 = 8000
    expect(ideeller.ueberschussCents).toBe(15000);
    expect(ideeller.yoyUeberschuss.absCents).toBe(7000);
    expect(ideeller.yoyUeberschuss.pct).toBe(88); // round(87.5)
  });

  it("YoY pct is null when prior Überschuss is zero", () => {
    const cur = makeYear({ vermoegen: 1000 }, {});
    const prior = makeYear({}, {});
    const out = computeSphereYoY(cur, prior);
    const vermoegen = out.find((r) => r.sphere === "vermoegen")!;
    expect(vermoegen.yoyUeberschuss.pct).toBeNull();
    expect(vermoegen.yoyUeberschuss.absCents).toBe(1000);
  });
});

// ── computeMonthlyOverschuss ────────────────────────────────────────────────

describe("computeMonthlyOverschuss", () => {
  it("empty input → all-zero length-12 array", () => {
    const out = computeMonthlyOverschuss([]);
    expect(out).toHaveLength(12);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("one March income → einnahmen at index 2", () => {
    const rows: MonthlyRow[] = [{ art: "income", month: 3, sumCents: 5000 }];
    const out = computeMonthlyOverschuss(rows);
    expect(out[2]).toBe(5000);
    expect(out.filter((v) => v !== 0)).toHaveLength(1);
  });

  it("one July expense → ausgabe subtracts at index 6", () => {
    const rows: MonthlyRow[] = [{ art: "expense", month: 7, sumCents: 3000 }];
    const out = computeMonthlyOverschuss(rows);
    expect(out[6]).toBe(-3000);
  });

  it("mixed across months sums correctly", () => {
    const rows: MonthlyRow[] = [
      { art: "income", month: 1, sumCents: 1000 },
      { art: "income", month: 1, sumCents: 500 },
      { art: "expense", month: 1, sumCents: 200 },
      { art: "income", month: 12, sumCents: 9999 },
    ];
    const out = computeMonthlyOverschuss(rows);
    expect(out[0]).toBe(1300); // 1000 + 500 - 200
    expect(out[11]).toBe(9999);
  });

  it("ignores rows with bad month values", () => {
    const rows: MonthlyRow[] = [
      { art: "income", month: 0, sumCents: 999 },
      { art: "income", month: 13, sumCents: 999 },
      { art: "income", month: 5, sumCents: 100 },
    ];
    const out = computeMonthlyOverschuss(rows);
    expect(out[4]).toBe(100);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("tolerates bigint sumCents (Postgres SUM returns bigint)", () => {
    const rows: MonthlyRow[] = [{ art: "income", month: 4, sumCents: 12345n }];
    const out = computeMonthlyOverschuss(rows);
    expect(out[3]).toBe(12345);
  });
});

// ── computeWgbStatus ────────────────────────────────────────────────────────

describe("computeWgbStatus", () => {
  it("0 cents → safe bucket, full remaining", () => {
    const out = computeWgbStatus(0);
    expect(out.bucket).toBe("safe");
    expect(out.einnahmenCents).toBe(0);
    expect(out.remainingCents).toBe(Number(WGB_FREIGRENZE_CENTS));
    expect(out.thresholdCents).toBe(Number(WGB_FREIGRENZE_CENTS));
  });

  it("under 80% threshold → safe", () => {
    // 50% of 5_000_000 = 2_500_000
    const out = computeWgbStatus(2_500_000);
    expect(out.bucket).toBe("safe");
  });

  it(">= 80% threshold and < 100% → warning", () => {
    // 80% of 5_000_000 = 4_000_000 (warning threshold)
    const out = computeWgbStatus(4_500_000);
    expect(out.bucket).toBe("warning");
    expect(out.remainingCents).toBe(500_000);
  });

  it(">= 100% threshold → over", () => {
    const out = computeWgbStatus(5_500_000);
    expect(out.bucket).toBe("over");
    expect(out.remainingCents).toBe(-500_000);
  });

  it("exactly at threshold (5_000_000) → over", () => {
    const out = computeWgbStatus(5_000_000);
    expect(out.bucket).toBe("over");
    expect(out.remainingCents).toBe(0);
  });

  it("exposes threshold of 50.000 EUR — JStG 2024 (§ 64 Abs. 3 AO i.V.m. JStG 2024)", () => {
    expect(WGB_FREIGRENZE_CENTS).toBe(5_000_000n);
  });
});

// ── computePreFlight ─────────────────────────────────────────────────────────

describe("computePreFlight", () => {
  function happyInput() {
    return {
      year: 2025,
      uncategorizedCount: 0,
      missingBelegCount: 0,
      missingBescheinigungenCount: 0,
      draftInvoiceCount: 0,
      auditInboxQueueCount: 0,
      festgeschriebenBis: null,
      totalIncomeRows: 50,
      totalExpenseRows: 100,
      totalDonationRows: 5,
      totalBeitragRows: 3,
      // Happy path closes a PAST year (2025) while 2026 is the running year — the
      // current/in-progress year is no longer closeable (mid-year close blocked).
      currentBuchungsjahr: 2026,
    };
  }

  it("happy path → all pass, canFestschreiben=true", () => {
    const out = computePreFlight(happyInput());
    expect(out.canFestschreiben).toBe(true);
    expect(out.blockers).toBe(0);
    expect(out.items.length).toBeGreaterThanOrEqual(5);
    expect(out.items.every((i) => i.status === "pass")).toBe(true);
  });

  it("uncategorized rows → blocker", () => {
    const out = computePreFlight({ ...happyInput(), uncategorizedCount: 3 });
    const item = out.items.find((i) => i.id === "uncategorized")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
    expect(out.blockers).toBeGreaterThanOrEqual(1);
  });

  it("missing Belege → warning (not blocker — receipts can come later)", () => {
    const out = computePreFlight({ ...happyInput(), missingBelegCount: 2 });
    const item = out.items.find((i) => i.id === "missingBelege")!;
    expect(item.status).toBe("warn");
    expect(out.canFestschreiben).toBe(true); // still allowed
  });

  it("draft invoices → blocker (must finalize before close)", () => {
    const out = computePreFlight({ ...happyInput(), draftInvoiceCount: 1 });
    const item = out.items.find((i) => i.id === "draftInvoices")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  it("audit-inbox queue > 0 → blocker", () => {
    const out = computePreFlight({
      ...happyInput(),
      auditInboxQueueCount: 5,
    });
    const item = out.items.find((i) => i.id === "auditInbox")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  it("festgeschriebenBis covers this year → blocker (already closed)", () => {
    const out = computePreFlight({
      ...happyInput(),
      festgeschriebenBis: 2025,
    });
    const item = out.items.find((i) => i.id === "alreadyClosed")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  it("festgeschriebenBis < year → not a blocker", () => {
    const out = computePreFlight({
      ...happyInput(),
      festgeschriebenBis: 2024,
    });
    const item = out.items.find((i) => i.id === "alreadyClosed")!;
    expect(item.status).toBe("pass");
    expect(out.canFestschreiben).toBe(true);
  });

  // C1-H5 — empty year is now a HARD blocker (cycle-2 fix).
  it("empty year (no rows) → hasBuchungen blocker", () => {
    const out = computePreFlight({
      ...happyInput(),
      totalIncomeRows: 0,
      totalExpenseRows: 0,
      totalDonationRows: 0,
      totalBeitragRows: 0,
    });
    const item = out.items.find((i) => i.id === "hasBuchungen")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  // C1-H5 — year with at least one donation or beitrag is sufficient
  it("year with only donations → hasBuchungen passes", () => {
    const out = computePreFlight({
      ...happyInput(),
      totalIncomeRows: 0,
      totalExpenseRows: 0,
      totalDonationRows: 3,
      totalBeitragRows: 0,
    });
    const item = out.items.find((i) => i.id === "hasBuchungen")!;
    expect(item.status).toBe("pass");
  });

  // C1-H5 — future year is blocked
  it("input.year > currentBuchungsjahr → yearNotFuture blocker", () => {
    const out = computePreFlight({
      ...happyInput(),
      year: 2099,
      currentBuchungsjahr: 2026,
    });
    const item = out.items.find((i) => i.id === "yearNotFuture")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  // C1-H5 — the CURRENT (in-progress) year cannot be closed mid-year (blocks)
  it("input.year === currentBuchungsjahr → yearNotFuture blocks (no mid-year close)", () => {
    const out = computePreFlight({
      ...happyInput(),
      year: 2026,
      currentBuchungsjahr: 2026,
    });
    const item = out.items.find((i) => i.id === "yearNotFuture")!;
    expect(item.status).toBe("block");
    expect(out.canFestschreiben).toBe(false);
  });

  // C1-H5 — a PAST year (year < currentBuchungsjahr) is closeable
  it("input.year < currentBuchungsjahr → yearNotFuture passes", () => {
    const out = computePreFlight({
      ...happyInput(),
      year: 2025,
      currentBuchungsjahr: 2026,
    });
    const item = out.items.find((i) => i.id === "yearNotFuture")!;
    expect(item.status).toBe("pass");
  });

  // C1-H3 — Bescheinigungs-status warn
  it("missingBescheinigungenCount > 0 → warn (not block)", () => {
    const out = computePreFlight({
      ...happyInput(),
      missingBescheinigungenCount: 2,
    });
    const item = out.items.find((i) => i.id === "bescheinigungen")!;
    expect(item.status).toBe("warn");
    expect(out.canFestschreiben).toBe(true);
  });

  it("missingBescheinigungenCount === 0 → pass", () => {
    const out = computePreFlight({ ...happyInput() });
    const item = out.items.find((i) => i.id === "bescheinigungen")!;
    expect(item.status).toBe("pass");
  });

  it("citation §50 EStDV referenced in pass detail copy", () => {
    const out = computePreFlight({ ...happyInput() });
    const item = out.items.find((i) => i.id === "bescheinigungen")!;
    expect(item.detail).toMatch(/EStDV/);
  });

  it("multiple blockers compound", () => {
    const out = computePreFlight({
      ...happyInput(),
      uncategorizedCount: 5,
      draftInvoiceCount: 2,
      auditInboxQueueCount: 1,
    });
    expect(out.blockers).toBeGreaterThanOrEqual(3);
    expect(out.canFestschreiben).toBe(false);
  });
});
