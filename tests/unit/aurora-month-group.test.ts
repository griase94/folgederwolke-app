import { describe, expect, it } from "vitest";
import {
  berlinMonthKey,
  groupByMonth,
  monthLabel,
} from "$lib/domain/month-group.js";

interface Row {
  id: string;
  datum: string;
  cents: number;
}

describe("berlinMonthKey", () => {
  it("slices date-only strings without TZ math", () => {
    expect(berlinMonthKey("2026-03-01")).toBe("2026-03");
  });
  it("converts ISO timestamps to the Berlin month (UTC New-Year boundary)", () => {
    // 2025-12-31T23:30:00Z is already 2026-01-01 00:30 in Berlin (CET +1).
    expect(berlinMonthKey("2025-12-31T23:30:00.000Z")).toBe("2026-01");
  });

  it("must be fed ISO, never a raw Postgres timestamp string", () => {
    // The date-only fast path keys off the missing "T", so a raw PG wire string
    // ("2026-03-31 23:30:00+00") is mistaken for an already-local date and the
    // month gets sliced straight off the UTC text — März, though that instant
    // is 01:30 on 1 April in Berlin. This is why `formatTs` in transactions.ts
    // parses instead of passing strings through: `db.execute` returns this
    // form where the Drizzle query builder returns a Date.
    expect(berlinMonthKey("2026-03-31 23:30:00+00")).toBe("2026-03");
    expect(
      berlinMonthKey(new Date("2026-03-31 23:30:00+00").toISOString()),
    ).toBe("2026-04");
  });
});

describe("monthLabel", () => {
  it("renders German month + year", () => {
    expect(monthLabel("2026-03")).toBe("März 2026");
    expect(monthLabel("2026-12")).toBe("Dezember 2026");
  });
});

describe("groupByMonth", () => {
  const rows: Row[] = [
    { id: "a", datum: "2026-04-20", cents: -500 },
    { id: "b", datum: "2026-04-02", cents: 1200 },
    { id: "c", datum: "2026-03-15", cents: -300 },
  ];

  it("buckets consecutive runs with a signed subtotal per month", () => {
    const groups = groupByMonth(
      rows,
      (r) => r.datum,
      (r) => r.cents,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-04", "2026-03"]);
    expect(groups[0]!.label).toBe("April 2026");
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups[0]!.subtotalCents).toBe(700);
    expect(groups[1]!.subtotalCents).toBe(-300);
  });

  it("returns [] for no rows", () => {
    expect(
      groupByMonth(
        [] as Row[],
        (r) => r.datum,
        (r) => r.cents,
      ),
    ).toEqual([]);
  });
});
