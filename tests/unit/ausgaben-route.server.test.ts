/**
 * @vitest-environment node
 * @phase-3
 *
 * Task 10 — flat list route-shell loads + the 308 redirect.
 *
 * The three list `load`s are thin: they parse the Phase-2 filter state, read
 * the year scope from `await parent()`, clamp the `?page` into range, and call
 * the matching `listXPage` + the per-tab picker-option loaders. We mock the
 * domain + picker modules so the loads are exercisable WITHOUT a real DB
 * (the RESET-lane integration coverage lives elsewhere) and assert on the args
 * the mocks captured + the shape each load returns.
 *
 * X-PRAG-04 — the per-tab option loads differ and we assert each one:
 *   - ausgaben  → listKategorieOptions("expense"); NO member picker (bezahltVon
 *                 is an enum) → memberOptions: []
 *   - einnahmen → listKategorieOptions("income");  NO member picker → []
 *   - spenden   → NO listKategorieOptions (no kategorie filter) → []; the
 *                 Spender filter IS a member-picker → listMemberOptions()
 *
 * P2-04 — listKategorieOptions returns the raw KategorieOption rows; the load
 * maps them to `{ value: name-snapshot, label }` (value = the name-snapshot
 * string the WHERE builder feeds to inArray(kategorieNameSnapshot, …)).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_YEARS } from "../../src/lib/domain/year.js";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT imports
// ---------------------------------------------------------------------------

// `_opts: unknown` gives `.mock.calls[n][0]` a typed (non-empty-tuple) element
// so the per-test `as {...}` arg casts below are narrowings of `unknown`, not
// reads off a zero-arg `[]` tuple.
const listAusgabenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));
const listEinnahmenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));
const listSpendenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));

// Phase 4 (Tier C1) added the KPI + bulk-pool loads to the Ausgaben `load`;
// the Einnahmen/Spenden shells still only call their `listXPage`. Mock the
// extra Ausgaben deps so this Phase-3 route-shell test keeps exercising all
// three shells (the rich Ausgaben KPI/bulk behaviour is covered by
// tests/unit/ausgaben-page.server.test.ts).
const listApprovedPendingErstattetMock = vi.fn(async () => []);
const listZahlungsartenMock = vi.fn(async () => []);

vi.mock("$lib/server/domain/transactions.js", () => ({
  listAusgabenPage: listAusgabenPageMock,
  listEinnahmenPage: listEinnahmenPageMock,
  listSpendenPage: listSpendenPageMock,
  listApprovedPendingErstattet: listApprovedPendingErstattetMock,
  listZahlungsarten: listZahlungsartenMock,
}));

vi.mock("$lib/server/domain/ausgaben-kpi.js", () => ({
  listAusgabenKpi: vi.fn(async () => ({
    totalCents: 0,
    count: 0,
    offenCount: 0,
    oldestOpenAgeDays: null,
  })),
}));

// Phase 6: the Spenden load now also calls the C3-owned listSpendenKpi (its own
// module). Mock it so the spenden load is exercisable without a real DB.
const listSpendenKpiMock = vi.fn(async (_year: unknown) => ({
  totalCents: 0,
  count: 0,
  ohneBescheinigungCount: 0,
  versandtCount: 0,
}));

vi.mock("$lib/server/domain/spenden-kpi.js", () => ({
  listSpendenKpi: listSpendenKpiMock,
}));

const listKategorieOptionsMock = vi.fn(async (kind: "expense" | "income") => [
  {
    id: `kat-${kind}-1`,
    kind,
    name: kind === "expense" ? "Verpflegung" : "Honorar",
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

const { load: ausgabenLoad } =
  await import("../../src/routes/app/ausgaben/+page.server.js");
const { load: einnahmenLoad } =
  await import("../../src/routes/app/einnahmen/+page.server.js");
const { load: spendenLoad } =
  await import("../../src/routes/app/spenden/+page.server.js");
const { load: transactionsLoad } =
  await import("../../src/routes/app/transactions/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers — synthesize the `{ url, parent }` load event
// ---------------------------------------------------------------------------

type Year = number | typeof ALL_YEARS;

function makeLoadEvent(
  pathname: string,
  search: string,
  parentData: { yearScope: Year; selectedYear: number; currentYear: number },
) {
  return {
    url: new URL(`http://test.local${pathname}${search}`),
    parent: async () => parentData,
  } as unknown as never;
}

const PARENT_2025 = {
  yearScope: 2025 as Year,
  selectedYear: 2025,
  currentYear: 2026,
};

beforeEach(() => {
  listAusgabenPageMock.mockClear();
  listEinnahmenPageMock.mockClear();
  listSpendenPageMock.mockClear();
  listKategorieOptionsMock.mockClear();
  listMemberOptionsMock.mockClear();
});

// ---------------------------------------------------------------------------
// Ausgaben
// ---------------------------------------------------------------------------

describe("/app/ausgaben load", () => {
  it("parses filters + year scope and calls listAusgabenPage with the parsed state + year", async () => {
    const data = await ausgabenLoad(
      makeLoadEvent("/app/ausgaben", "?status=geprueft", PARENT_2025),
    );

    expect(listAusgabenPageMock).toHaveBeenCalledTimes(1);
    const arg = listAusgabenPageMock.mock.calls[0]![0] as {
      state: { enums: Record<string, string[]> };
      year: Year;
      limit: number;
      offset: number;
    };
    // Phase-2 parseFilterState picked up the ausgaben `status` enum filter.
    expect(arg.state.enums.status).toEqual(["geprueft"]);
    // Year comes from the layout's yearScope (so ALL_YEARS survives — below).
    expect(arg.year).toBe(2025);
    expect(arg.limit).toBe(50);
    expect(arg.offset).toBe(0);

    expect((data as { tab: string }).tab ?? "ausgaben").toBeDefined();
    expect((data as { total: number }).total).toBe(0);
  });

  it("loads listKategorieOptions('expense') and passes memberOptions: [] (bezahltVon is an enum, not a member picker)", async () => {
    const data = (await ausgabenLoad(
      makeLoadEvent("/app/ausgaben", "", PARENT_2025),
    )) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };

    expect(listKategorieOptionsMock).toHaveBeenCalledWith("expense");
    expect(listMemberOptionsMock).not.toHaveBeenCalled();
    // P2-04: value = kategorie NAME-SNAPSHOT string.
    expect(data.kategorieOptions).toEqual([
      { value: "Verpflegung", label: "Verpflegung" },
    ]);
    expect(data.memberOptions).toEqual([]);
  });

  it("forwards the ALL_YEARS scope to listAusgabenPage (Alle Jahre survives)", async () => {
    await ausgabenLoad(
      makeLoadEvent("/app/ausgaben", "?year=all", {
        yearScope: ALL_YEARS,
        selectedYear: 2026,
        currentYear: 2026,
      }),
    );
    const arg = listAusgabenPageMock.mock.calls[0]![0] as { year: Year };
    expect(arg.year).toBe(ALL_YEARS);
  });

  it("clamps an out-of-bounds ?page to the last page (the displayed fetch offset never runs past the result set)", async () => {
    // total 120, pageSize 50 → 3 pages. ?page=99 must clamp to 3 → the offset
    // that fetches the DISPLAYED rows is 100 (the re-query at the clamped page).
    listAusgabenPageMock.mockResolvedValue({ rows: [], total: 120 });
    const data = (await ausgabenLoad(
      makeLoadEvent("/app/ausgaben", "?page=99", PARENT_2025),
    )) as { page: number };

    // The last call is the one whose rows are returned to the page; its offset
    // must be clamped to the last page (100), never the garbage 4900.
    const calls = listAusgabenPageMock.mock.calls;
    const lastArg = calls[calls.length - 1]![0] as { offset: number };
    expect(data.page).toBe(3);
    expect(lastArg.offset).toBe(100);
  });

  it("clamps ?page=0 / negative / garbage up to page 1 (offset 0)", async () => {
    const data = (await ausgabenLoad(
      makeLoadEvent("/app/ausgaben", "?page=0", PARENT_2025),
    )) as { page: number };
    const arg = listAusgabenPageMock.mock.calls[0]![0] as { offset: number };
    expect(data.page).toBe(1);
    expect(arg.offset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Einnahmen
// ---------------------------------------------------------------------------

describe("/app/einnahmen load", () => {
  it("calls listEinnahmenPage + listKategorieOptions('income'); memberOptions: [] (no member filter)", async () => {
    const data = (await einnahmenLoad(
      makeLoadEvent("/app/einnahmen", "", PARENT_2025),
    )) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };

    expect(listEinnahmenPageMock).toHaveBeenCalledTimes(1);
    expect(listKategorieOptionsMock).toHaveBeenCalledWith("income");
    expect(listMemberOptionsMock).not.toHaveBeenCalled();
    expect(data.kategorieOptions).toEqual([
      { value: "Honorar", label: "Honorar" },
    ]);
    expect(data.memberOptions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Spenden
// ---------------------------------------------------------------------------

describe("/app/spenden load", () => {
  it("calls listSpendenPage + listMemberOptions; NO listKategorieOptions; kategorieOptions: []", async () => {
    const data = (await spendenLoad(
      makeLoadEvent("/app/spenden", "", PARENT_2025),
    )) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };

    expect(listSpendenPageMock).toHaveBeenCalledTimes(1);
    expect(listMemberOptionsMock).toHaveBeenCalledTimes(1);
    expect(listKategorieOptionsMock).not.toHaveBeenCalled();
    expect(data.kategorieOptions).toEqual([]);
    expect(data.memberOptions).toEqual([
      { id: "11111111-1111-4111-8111-111111111111", label: "Mustermann Max" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Redirect — /app/transactions → 308 /app/ausgaben (preserving ?year=)
// ---------------------------------------------------------------------------

async function runLoadExpectRedirect(
  // PageServerLoad returns MaybePromise<void | {...}>; `unknown` accepts that
  // (a redirect throws, so the resolved value is never inspected anyway).
  fn: (e: never) => unknown,
  event: never,
): Promise<{ status: number; location: string }> {
  try {
    await fn(event);
    throw new Error("expected the load to throw a redirect");
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      "location" in err
    ) {
      return {
        status: (err as { status: number }).status,
        location: (err as { location: string }).location,
      };
    }
    throw err;
  }
}

describe("/app/transactions redirect", () => {
  it("redirects 308 → /app/ausgaben", async () => {
    const r = await runLoadExpectRedirect(
      transactionsLoad,
      makeLoadEvent("/app/transactions", "", PARENT_2025),
    );
    expect(r.status).toBe(308);
    expect(r.location).toBe("/app/ausgaben");
  });

  it("preserves ?year= (and other query) on the redirect", async () => {
    const r = await runLoadExpectRedirect(
      transactionsLoad,
      makeLoadEvent("/app/transactions", "?year=2024", PARENT_2025),
    );
    expect(r.status).toBe(308);
    expect(r.location).toBe("/app/ausgaben?year=2024");
  });
});
