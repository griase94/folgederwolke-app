/**
 * @vitest-environment node
 * @phase-5-einnahmen
 *
 * Phase 5 / Task 2 — the Einnahmen list `load` (Tier C2).
 *
 * The load is thin: parse the Phase-2 filter state for the "einnahmen" tab,
 * read the year scope from `await parent()`, clamp the `?page` into range,
 * then call `listEinnahmenPage({ state, year, limit, offset })` + the new
 * C2-owned `listEinnahmenKpi(year)` + `listKategorieOptions("income")`. It
 * returns `{ rows, total, page, pageSize, kpi, kategorieOptions, memberOptions }`
 * — NO `approvedPending`, NO `bulk` payload (Einnahmen has no bulk).
 *
 * We mock the domain + KPI + picker modules so the load is exercisable WITHOUT
 * a real DB and assert on the args the mocks captured + the returned shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_YEARS } from "../../src/lib/domain/year.js";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const listEinnahmenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));
vi.mock("$lib/server/domain/transactions.js", () => ({
  listEinnahmenPage: listEinnahmenPageMock,
}));

const KPI_FIXTURE = {
  totalCents: 1_250_00,
  count: 12,
  bySphere: {
    ideeller: 800_00,
    vermoegen: 0,
    zweckbetrieb: 300_00,
    wirtschaftlich: 150_00,
  },
};
const listEinnahmenKpiMock = vi.fn(async (_year: unknown) => KPI_FIXTURE);
vi.mock("$lib/server/domain/einnahmen-kpi.js", () => ({
  listEinnahmenKpi: listEinnahmenKpiMock,
}));

const listKategorieOptionsMock = vi.fn(async (_kind: "income") => [
  {
    id: "kat-income-1",
    kind: "income",
    name: "Honorar",
    sphere: "ideeller",
    sortOrder: 0,
    deactivated: false,
  },
]);
const listMemberOptionsMock = vi.fn(async () => [
  { id: "11111111-1111-4111-8111-111111111111", label: "Mustermann Max" },
]);
vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: listKategorieOptionsMock,
  listMemberOptions: listMemberOptionsMock,
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { load } = await import("../../src/routes/app/einnahmen/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Year = number | typeof ALL_YEARS;

function makeLoadEvent(
  search: string,
  parentData: { yearScope: Year; selectedYear: number; currentYear: number },
) {
  return {
    url: new URL(`http://test.local/app/einnahmen${search}`),
    parent: async () => parentData,
  } as unknown as never;
}

const PARENT_2025 = {
  yearScope: 2025 as Year,
  selectedYear: 2025,
  currentYear: 2026,
};

beforeEach(() => {
  listEinnahmenPageMock.mockReset();
  listEinnahmenPageMock.mockResolvedValue({ rows: [], total: 0, sumCents: 0, monthCount: 0 });
  listEinnahmenKpiMock.mockClear();
  listKategorieOptionsMock.mockClear();
  listMemberOptionsMock.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/app/einnahmen load", () => {
  it("parses the einnahmen filter state + year scope and calls listEinnahmenPage", async () => {
    await load(makeLoadEvent("?kategorie=Honorar", PARENT_2025));

    expect(listEinnahmenPageMock).toHaveBeenCalledTimes(1);
    const arg = listEinnahmenPageMock.mock.calls[0]![0] as {
      state: { enums: Record<string, string[]> };
      year: Year;
      limit: number;
      offset: number;
    };
    // Phase-2 parseFilterState picked up the einnahmen `kategorie` enum filter.
    expect(arg.state.enums.kategorie).toEqual(["Honorar"]);
    expect(arg.year).toBe(2025);
    expect(arg.limit).toBe(50);
    expect(arg.offset).toBe(0);
  });

  it("binds the 'mitRechnung' (nur mit Rechnung) boolean filter from the URL", async () => {
    await load(makeLoadEvent("?mitRechnung=true", PARENT_2025));
    const arg = listEinnahmenPageMock.mock.calls[0]![0] as {
      state: { booleans: Record<string, boolean> };
    };
    expect(arg.state.booleans.mitRechnung).toBe(true);
  });

  it("calls listEinnahmenKpi(year) and returns the kpi in the load result", async () => {
    const data = (await load(makeLoadEvent("", PARENT_2025))) as {
      kpi: typeof KPI_FIXTURE;
    };
    expect(listEinnahmenKpiMock).toHaveBeenCalledTimes(1);
    expect(listEinnahmenKpiMock).toHaveBeenCalledWith(2025);
    expect(data.kpi).toEqual(KPI_FIXTURE);
  });

  it("loads listKategorieOptions('income') → {value,label}; memberOptions: [] (no member filter)", async () => {
    const data = (await load(makeLoadEvent("", PARENT_2025))) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };
    expect(listKategorieOptionsMock).toHaveBeenCalledWith("income");
    expect(listMemberOptionsMock).not.toHaveBeenCalled();
    expect(data.kategorieOptions).toEqual([
      { value: "Honorar", label: "Honorar" },
    ]);
    expect(data.memberOptions).toEqual([]);
  });

  it("returns NO bulk payload (Einnahmen has no bulk-select)", async () => {
    const data = (await load(makeLoadEvent("", PARENT_2025))) as Record<
      string,
      unknown
    >;
    expect(data.bulk).toBeUndefined();
    expect(data.approvedPending).toBeUndefined();
  });

  it("forwards the ALL_YEARS scope to listEinnahmenPage + listEinnahmenKpi", async () => {
    await load(
      makeLoadEvent("?year=all", {
        yearScope: ALL_YEARS,
        selectedYear: 2026,
        currentYear: 2026,
      }),
    );
    const arg = listEinnahmenPageMock.mock.calls[0]![0] as { year: Year };
    expect(arg.year).toBe(ALL_YEARS);
    expect(listEinnahmenKpiMock).toHaveBeenCalledWith(ALL_YEARS);
  });

  it("clamps an out-of-bounds ?page to the last page (re-queries at the clamped offset)", async () => {
    listEinnahmenPageMock.mockResolvedValue({ rows: [], total: 120, sumCents: 0, monthCount: 0 });
    const data = (await load(makeLoadEvent("?page=99", PARENT_2025))) as {
      page: number;
    };
    const calls = listEinnahmenPageMock.mock.calls;
    const lastArg = calls[calls.length - 1]![0] as { offset: number };
    expect(data.page).toBe(3);
    expect(lastArg.offset).toBe(100);
  });

  it("clamps ?page=0 / garbage up to page 1 (offset 0)", async () => {
    const data = (await load(makeLoadEvent("?page=0", PARENT_2025))) as {
      page: number;
    };
    const arg = listEinnahmenPageMock.mock.calls[0]![0] as { offset: number };
    expect(data.page).toBe(1);
    expect(arg.offset).toBe(0);
  });
});
