/**
 * @vitest-environment node
 *
 * Aurora slice 5 — /app/transaktionen load: thin shell over
 * listTransaktionenFeedPage (parse "transaktionen" filter state, forward the
 * layout year scope, clamp ?page exactly like the per-type list routes).
 * Mock harness mirrors tests/unit/ausgaben-route.server.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_YEARS } from "../../src/lib/domain/year.js";

const feedMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
  sumCents: 0,
  monthCount: 0,
}));
const countMock = vi.fn(async (_opts: unknown) => ({
  expense: 0,
  income: 0,
  donation: 0,
  total: 0,
}));
vi.mock("$lib/server/domain/transactions.js", () => ({
  listTransaktionenFeedPage: feedMock,
  countTransaktionenFeedByKind: countMock,
}));

const { load } =
  await import("../../src/routes/app/transaktionen/+page.server.js");

type Year = number | typeof ALL_YEARS;

function makeLoadEvent(
  search: string,
  parentData: { yearScope: Year; selectedYear: number; currentYear: number },
) {
  return {
    url: new URL(`http://test.local/app/transaktionen${search}`),
    parent: async () => parentData,
  } as unknown as never;
}

const PARENT_2026 = {
  yearScope: 2026 as Year,
  selectedYear: 2026,
  currentYear: 2026,
};

beforeEach(() => {
  feedMock.mockReset();
  feedMock.mockResolvedValue({
    rows: [],
    total: 0,
    sumCents: 0,
    monthCount: 0,
  });
  countMock.mockReset();
  countMock.mockResolvedValue({ expense: 0, income: 0, donation: 0, total: 0 });
});

describe("/app/transaktionen load", () => {
  it("parses ?typ + ?q into the transaktionen filter state and forwards the year scope", async () => {
    const data = (await load(
      makeLoadEvent("?typ=spenden&q=beleg", PARENT_2026),
    )) as { total: number; filterState: { enums: Record<string, string[]> } };

    expect(feedMock).toHaveBeenCalledTimes(1);
    const arg = feedMock.mock.calls[0]![0] as {
      state: { enums: Record<string, string[]>; search?: string };
      year: Year;
      limit: number;
      offset: number;
    };
    expect(arg.state.enums.typ).toEqual(["spenden"]);
    expect(arg.state.search).toBe("beleg");
    expect(arg.year).toBe(2026);
    expect(arg.limit).toBe(50);
    expect(arg.offset).toBe(0);
    expect(data.total).toBe(0);
    expect(data.filterState.enums.typ).toEqual(["spenden"]);
  });

  it("forwards ALL_YEARS unchanged", async () => {
    await load(
      makeLoadEvent("?year=all", {
        yearScope: ALL_YEARS,
        selectedYear: 2026,
        currentYear: 2026,
      }),
    );
    const arg = feedMock.mock.calls[0]![0] as { year: Year };
    expect(arg.year).toBe(ALL_YEARS);
  });

  it("clamps an out-of-bounds ?page to the last page (offset of the displayed fetch = last page)", async () => {
    feedMock.mockResolvedValue({ rows: [], total: 120 });
    const data = (await load(makeLoadEvent("?page=99", PARENT_2026))) as {
      page: number;
    };
    const calls = feedMock.mock.calls;
    const lastArg = calls[calls.length - 1]![0] as { offset: number };
    expect(data.page).toBe(3);
    expect(lastArg.offset).toBe(100);
  });

  it("clamps ?page=0 / garbage up to page 1 (offset 0)", async () => {
    const data = (await load(makeLoadEvent("?page=0", PARENT_2026))) as {
      page: number;
    };
    const arg = feedMock.mock.calls[0]![0] as { offset: number };
    expect(data.page).toBe(1);
    expect(arg.offset).toBe(0);
  });
});
