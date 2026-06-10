/**
 * @vitest-environment node
 * @phase-4-ausgaben
 *
 * Unit tests for the Ausgaben list route `/app/ausgaben/+page.server.ts` —
 * Phase 4 (Tier C1). The Phase-3 shell `load` is REPLACED here with the
 * Ausgaben-specific one: it still parses the Phase-2 filter state + clamps the
 * page, but now ALSO calls `listAusgabenKpi` (the header pill) and
 * `listApprovedPendingErstattet` (the bulk pool) and surfaces both.
 *
 * Task 3 extends this file with the bulk `?/bulk-mark-erstattet` /
 * `?/sepa-mark-erstattet` actions, which return a PER-ROW result array
 * `{ results: { id, status }[] }` (not a single boolean) so the UI can show a
 * partial-failure summary ("9 erstattet, 1 festgeschrieben", spec §7.1).
 *
 * Everything the load/actions touch is mocked so the handlers run WITHOUT a
 * real DB (RESET-lane integration coverage lives in the KPI integration test
 * + e2e). We assert on the args captured by the mocks + the returned shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_YEARS } from "../../src/lib/domain/year.js";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const listAusgabenPageMock = vi.fn(async (_opts: unknown) => ({
  rows: [],
  total: 0,
}));
const listAusgabenKpiMock = vi.fn(async (_year: unknown) => ({
  totalCents: 842000,
  count: 47,
  offenCount: 3,
  oldestOpenAgeDays: 18,
}));
const listApprovedPendingErstattetMock = vi.fn(async () => [
  {
    id: "exp-open-1",
    businessId: "A-2026-001",
    bezeichnung: "Bahnfahrt",
    betragCents: 4200,
    bezahltVonDisplay: "Felix",
    bezahltVonKind: "member",
    externIban: null,
    externName: null,
    bezahltVonMemberId: "mem-1",
    memberIban: "DE00",
  },
]);
const listZahlungsartenMock = vi.fn(async () => [
  { id: "za-bank", kind: "bank", label: "Banküberweisung" },
]);
const markExpenseAsPaidMock = vi.fn(async () => ({ ok: true as const }));

vi.mock("$lib/server/domain/transactions.js", () => ({
  listAusgabenPage: listAusgabenPageMock,
  listApprovedPendingErstattet: listApprovedPendingErstattetMock,
  listZahlungsarten: listZahlungsartenMock,
  markExpenseAsPaid: markExpenseAsPaidMock,
}));

vi.mock("$lib/server/domain/ausgaben-kpi.js", () => ({
  listAusgabenKpi: listAusgabenKpiMock,
}));

const listKategorieOptionsMock = vi.fn(async (kind: "expense" | "income") => [
  {
    id: `kat-${kind}-1`,
    kind,
    name: "Verpflegung",
    sphere: "ideeller",
    sortOrder: 0,
    deactivated: false,
  },
]);

vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: listKategorieOptionsMock,
}));

// markExpenseErstattet — the per-row bulk mailing path. Typed on the real
// result union so `.mockImplementation` can return the festgeschrieben/error
// branch without a type clash.
type ErstattetResult =
  | { ok: true; alreadyErstattet: boolean }
  | { ok: false; status: number; error: string };
const markExpenseErstattetMock = vi.fn(
  async (_input: { expenseId: string }): Promise<ErstattetResult> => ({
    ok: true,
    alreadyErstattet: false,
  }),
);
vi.mock("$lib/server/domain/audit-inbox-actions.js", () => ({
  markExpenseErstattet: markExpenseErstattetMock,
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { load, actions } =
  await import("../../src/routes/app/ausgaben/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Year = number | typeof ALL_YEARS;

function makeLoadEvent(
  search: string,
  parentData: { yearScope: Year; selectedYear: number; currentYear: number },
) {
  return {
    url: new URL(`http://test.local/app/ausgaben${search}`),
    parent: async () => parentData,
  } as unknown as never;
}

const PARENT_2025 = {
  yearScope: 2025 as Year,
  selectedYear: 2025,
  currentYear: 2026,
};

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } | null };
}

function makeActionEvent(
  fields: Record<string, string>,
  user: { id: string } | null = { id: "user-1" },
): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: new Request("http://test.local/app/ausgaben", {
      method: "POST",
      body: fd,
    }),
    locals: { session: user ? { user } : null },
  };
}

async function runAction(
  name: "bulk-mark-erstattet" | "sepa-mark-erstattet",
  event: ActionEvent,
): Promise<unknown> {
  const fn = (
    actions as unknown as Record<string, (e: ActionEvent) => Promise<unknown>>
  )[name]!;
  return fn(event);
}

beforeEach(() => {
  listAusgabenPageMock.mockClear();
  listAusgabenKpiMock.mockClear();
  listApprovedPendingErstattetMock.mockClear();
  listKategorieOptionsMock.mockClear();
  markExpenseErstattetMock.mockClear();
  markExpenseErstattetMock.mockResolvedValue({
    ok: true,
    alreadyErstattet: false,
  });
});

// ---------------------------------------------------------------------------
// load — KPI + bulk pool (Task 2)
// ---------------------------------------------------------------------------

describe("/app/ausgaben load (Phase 4)", () => {
  it("calls listAusgabenKpi with the year scope and returns the kpi", async () => {
    const data = (await load(makeLoadEvent("", PARENT_2025))) as {
      kpi: { offenCount: number; oldestOpenAgeDays: number | null };
    };
    expect(listAusgabenKpiMock).toHaveBeenCalledWith(2025);
    expect(data.kpi.offenCount).toBe(3);
    expect(data.kpi.oldestOpenAgeDays).toBe(18);
  });

  it("forwards ALL_YEARS to both listAusgabenPage and listAusgabenKpi", async () => {
    await load(
      makeLoadEvent("?year=all", {
        yearScope: ALL_YEARS,
        selectedYear: 2026,
        currentYear: 2026,
      }),
    );
    const pageArg = listAusgabenPageMock.mock.calls[0]![0] as { year: Year };
    expect(pageArg.year).toBe(ALL_YEARS);
    expect(listAusgabenKpiMock).toHaveBeenCalledWith(ALL_YEARS);
  });

  it("loads the bulk pool (listApprovedPendingErstattet) + zahlungsarten and returns them", async () => {
    const data = (await load(makeLoadEvent("", PARENT_2025))) as {
      approvedPending: { id: string }[];
      zahlungsarten: { id: string }[];
    };
    expect(listApprovedPendingErstattetMock).toHaveBeenCalledTimes(1);
    expect(data.approvedPending).toHaveLength(1);
    expect(data.approvedPending[0]!.id).toBe("exp-open-1");
    expect(data.zahlungsarten).toHaveLength(1);
  });

  it("still parses the status enum filter + passes memberOptions: [] (bezahltVon is an enum)", async () => {
    const data = (await load(
      makeLoadEvent("?status=geprueft", PARENT_2025),
    )) as {
      kategorieOptions: { value: string; label: string }[];
      memberOptions: { id: string; label: string }[];
    };
    const arg = listAusgabenPageMock.mock.calls[0]![0] as {
      state: { enums: Record<string, string[]> };
    };
    expect(arg.state.enums.status).toEqual(["geprueft"]);
    expect(listKategorieOptionsMock).toHaveBeenCalledWith("expense");
    expect(data.kategorieOptions).toEqual([
      { value: "Verpflegung", label: "Verpflegung" },
    ]);
    expect(data.memberOptions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bulk actions — per-row result array (Task 3)
// ---------------------------------------------------------------------------

describe("/app/ausgaben ?/bulk-mark-erstattet (Phase 4)", () => {
  it("marks N expenses erstattet (one markExpenseErstattet per row) and returns a per-row result array", async () => {
    const event = makeActionEvent({
      expenseIds: "exp-1,exp-2,exp-3",
      chosenDate: "2026-05-10",
      zahlungsartId: "11111111-1111-4111-8111-111111111111",
    });
    const result = (await runAction("bulk-mark-erstattet", event)) as {
      ok: boolean;
      results: { id: string; status: string }[];
    };
    expect(markExpenseErstattetMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.status === "erstattet")).toBe(true);
    expect(result.results.map((r) => r.id)).toEqual([
      "exp-1",
      "exp-2",
      "exp-3",
    ]);
  });

  it("reports partial failure per row (festgeschrieben row → status, not a thrown error)", async () => {
    // Row 2 is festgeschrieben (409) — the others succeed. The action must
    // surface a per-row status, NOT collapse to a single fail(409, "a; b").
    markExpenseErstattetMock.mockImplementation(
      async (input: { expenseId: string }) =>
        input.expenseId === "exp-2"
          ? {
              ok: false as const,
              status: 409,
              error: "Jahr 2025 ist festgeschrieben",
            }
          : { ok: true as const, alreadyErstattet: false },
    );

    const event = makeActionEvent({
      expenseIds: "exp-1,exp-2,exp-3",
      chosenDate: "2026-05-10",
      zahlungsartId: "11111111-1111-4111-8111-111111111111",
    });
    const result = (await runAction("bulk-mark-erstattet", event)) as {
      ok: boolean;
      results: { id: string; status: string }[];
    };
    expect(result.results).toHaveLength(3);
    const byId = Object.fromEntries(
      result.results.map((r) => [r.id, r.status]),
    );
    expect(byId["exp-1"]).toBe("erstattet");
    expect(byId["exp-2"]).toBe("festgeschrieben");
    expect(byId["exp-3"]).toBe("erstattet");
  });

  it("returns a structured per-row summary (erstattet/festgeschrieben/bereitsBezahlt/notFound/fehler buckets, §8)", async () => {
    markExpenseErstattetMock.mockImplementation(
      async (input: { expenseId: string }) => {
        switch (input.expenseId) {
          case "fest-1":
            return {
              ok: false as const,
              status: 409,
              error: "Jahr 2025 ist festgeschrieben",
            };
          case "gone-1":
            return {
              ok: false as const,
              status: 404,
              error: "Buchung nicht gefunden",
            };
          case "bereits-1":
            return { ok: true as const, alreadyErstattet: true };
          case "boom-1":
            return { ok: false as const, status: 500, error: "DB-Fehler" };
          default:
            return { ok: true as const, alreadyErstattet: false };
        }
      },
    );

    const event = makeActionEvent({
      expenseIds: "ok-1,fest-1,gone-1,bereits-1,boom-1",
      chosenDate: "2026-05-10",
      zahlungsartId: "11111111-1111-4111-8111-111111111111",
    });
    const result = (await runAction("bulk-mark-erstattet", event)) as {
      ok: boolean;
      summary: {
        erstattet: string[];
        festgeschrieben: string[];
        bereitsBezahlt: string[];
        notFound: string[];
        fehler: { id: string; error: string }[];
      };
    };
    expect(result.summary.erstattet).toEqual(["ok-1"]);
    expect(result.summary.festgeschrieben).toEqual(["fest-1"]);
    expect(result.summary.notFound).toEqual(["gone-1"]);
    expect(result.summary.bereitsBezahlt).toEqual(["bereits-1"]);
    expect(result.summary.fehler).toEqual([
      { id: "boom-1", error: "DB-Fehler" },
    ]);
    // A hard row error → ok:false (the toast warns); pure festgeschrieben/already
    // partial outcomes stay ok:true (expected, not a failure).
    expect(result.ok).toBe(false);
  });

  it("maps an already-reimbursed row to status 'bereits-erstattet'", async () => {
    markExpenseErstattetMock.mockImplementation(
      async (input: { expenseId: string }) =>
        input.expenseId === "exp-2"
          ? { ok: true as const, alreadyErstattet: true }
          : { ok: true as const, alreadyErstattet: false },
    );
    const event = makeActionEvent({
      expenseIds: "exp-1,exp-2",
      chosenDate: "2026-05-10",
      zahlungsartId: "11111111-1111-4111-8111-111111111111",
    });
    const result = (await runAction("bulk-mark-erstattet", event)) as {
      results: { id: string; status: string }[];
    };
    const byId = Object.fromEntries(
      result.results.map((r) => [r.id, r.status]),
    );
    expect(byId["exp-1"]).toBe("erstattet");
    expect(byId["exp-2"]).toBe("bereits-erstattet");
  });

  it("rejects when not signed in", async () => {
    const event = makeActionEvent(
      {
        expenseIds: "exp-1",
        chosenDate: "2026-05-10",
        zahlungsartId: "11111111-1111-4111-8111-111111111111",
      },
      null,
    );
    const result = (await runAction("bulk-mark-erstattet", event)) as {
      status?: number;
    };
    expect(result.status).toBe(401);
    expect(markExpenseErstattetMock).not.toHaveBeenCalled();
  });
});
