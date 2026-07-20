/**
 * @vitest-environment node
 * @phase-6-spenden
 *
 * Task 2 — the Spenden list `load`.
 *
 * Thin load: parse the Phase-2 filter state, read the layout year scope from
 * `await parent()`, clamp `?page`, then call `listSpendenPage` + the C3-owned
 * `listSpendenKpi` + `listMemberOptions` (the Spender filter IS a member
 * picker). It must NOT call `listKategorieOptions` — §9.1: Spenden has no
 * Kategorie filter → `kategorieOptions: []`. We mock the domain + KPI + picker
 * modules so the load is exercisable without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_YEARS } from "../../src/lib/domain/year.js";

const listSpendenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));

vi.mock("$lib/server/domain/transactions.js", () => ({
  listSpendenPage: listSpendenPageMock,
}));

const listSpendenKpiMock = vi.fn(async (_year: unknown) => ({
  totalCents: 250000,
  count: 12,
  ohneBescheinigungCount: 3,
  versandtCount: 9,
}));

vi.mock("$lib/server/domain/spenden-kpi.js", () => ({
  listSpendenKpi: listSpendenKpiMock,
}));

const listKategorieOptionsMock = vi.fn(async () => []);
const listMemberOptionsMock = vi.fn(async () => [
  { id: "11111111-1111-4111-8111-111111111111", label: "Mustermann Max" },
]);

vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: listKategorieOptionsMock,
  listMemberOptions: listMemberOptionsMock,
}));

const { load: spendenLoad } =
  await import("../../src/routes/app/spenden/+page.server.js");

type Year = number | typeof ALL_YEARS;

function makeLoadEvent(
  search: string,
  parentData: { yearScope: Year; selectedYear: number; currentYear: number },
) {
  return {
    url: new URL(`http://test.local/app/spenden${search}`),
    parent: async () => parentData,
  } as unknown as never;
}

const PARENT_2025 = {
  yearScope: 2025 as Year,
  selectedYear: 2025,
  currentYear: 2026,
};

beforeEach(() => {
  listSpendenPageMock.mockClear();
  listSpendenPageMock.mockResolvedValue({ rows: [], total: 0, sumCents: 0, monthCount: 0 });
  listSpendenKpiMock.mockClear();
  listKategorieOptionsMock.mockClear();
  listMemberOptionsMock.mockClear();
});

describe("/app/spenden load", () => {
  it("parses filters + year scope and calls listSpendenPage with the parsed state + year", async () => {
    await spendenLoad(makeLoadEvent("?bescheinigung=ausstehend", PARENT_2025));

    expect(listSpendenPageMock).toHaveBeenCalledTimes(1);
    const arg = listSpendenPageMock.mock.calls[0]![0] as {
      state: { enums: Record<string, string[]> };
      year: Year;
      limit: number;
      offset: number;
    };
    expect(arg.year).toBe(2025);
    expect(arg.limit).toBe(50);
    expect(arg.offset).toBe(0);
  });

  it("calls listSpendenKpi(year) and returns the kpi bundle", async () => {
    const data = (await spendenLoad(makeLoadEvent("", PARENT_2025))) as {
      kpi: {
        totalCents: number;
        count: number;
        ohneBescheinigungCount: number;
        versandtCount: number;
      };
    };
    expect(listSpendenKpiMock).toHaveBeenCalledTimes(1);
    expect(listSpendenKpiMock.mock.calls[0]![0]).toBe(2025);
    expect(data.kpi).toEqual({
      totalCents: 250000,
      count: 12,
      ohneBescheinigungCount: 3,
      versandtCount: 9,
    });
  });

  it("calls listMemberOptions; does NOT call listKategorieOptions; kategorieOptions: []", async () => {
    const data = (await spendenLoad(makeLoadEvent("", PARENT_2025))) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };
    expect(listMemberOptionsMock).toHaveBeenCalledTimes(1);
    expect(listKategorieOptionsMock).not.toHaveBeenCalled();
    expect(data.kategorieOptions).toEqual([]);
    expect(data.memberOptions).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", label: "Mustermann Max" },
    ]);
  });

  it("forwards the ALL_YEARS scope to both listSpendenPage and listSpendenKpi", async () => {
    await spendenLoad(
      makeLoadEvent("?year=all", {
        yearScope: ALL_YEARS,
        selectedYear: 2026,
        currentYear: 2026,
      }),
    );
    const pageArg = listSpendenPageMock.mock.calls[0]![0] as { year: Year };
    expect(pageArg.year).toBe(ALL_YEARS);
    expect(listSpendenKpiMock.mock.calls[0]![0]).toBe(ALL_YEARS);
  });

  it("clamps an out-of-bounds ?page to the last page", async () => {
    listSpendenPageMock.mockResolvedValue({ rows: [], total: 120, sumCents: 0, monthCount: 0 });
    const data = (await spendenLoad(
      makeLoadEvent("?page=99", PARENT_2025),
    )) as { page: number };
    const calls = listSpendenPageMock.mock.calls;
    const lastArg = calls[calls.length - 1]![0] as { offset: number };
    expect(data.page).toBe(3);
    expect(lastArg.offset).toBe(100);
  });
});
