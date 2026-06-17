/**
 * @vitest-environment node
 * @phase-aurora-slice4
 *
 * /app/ausgaben/ueberweisungen server — the worklist that ABSORBS the old
 * SepaCopyModal/bulk flow. load returns the approved-pending pool +
 * Zahlungsarten; ?/bulk-mark-erstattet keeps the exact per-row result/summary
 * semantics that previously lived on /app/ausgaben (tests migrated from
 * tests/unit/ausgaben-page.server.test.ts Task 3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these are initialized before vi.mock factories run.
const {
  listApprovedPendingErstattetMock,
  listZahlungsartenMock,
  markExpenseErstattetMock,
} = vi.hoisted(() => ({
  listApprovedPendingErstattetMock: vi.fn(async () => [
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
  ]),
  listZahlungsartenMock: vi.fn(async () => [
    { id: "za-bank", kind: "bank", label: "Banküberweisung" },
  ]),
  markExpenseErstattetMock: vi.fn(),
}));

vi.mock("$lib/server/domain/transactions.js", () => ({
  listApprovedPendingErstattet: listApprovedPendingErstattetMock,
  listZahlungsarten: listZahlungsartenMock,
}));
vi.mock("$lib/server/domain/audit-inbox-actions.js", () => ({
  markExpenseErstattet: markExpenseErstattetMock,
}));

import {
  load,
  actions,
} from "../../src/routes/app/ausgaben/ueberweisungen/+page.server.js";

beforeEach(() => {
  vi.clearAllMocks();
  markExpenseErstattetMock.mockResolvedValue({
    ok: true,
    alreadyErstattet: false,
  });
});

function actionEvent(
  form: Record<string, string>,
  user: { id: string } | null,
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) fd.set(k, v);
  return {
    request: new Request("http://localhost/app/ausgaben/ueberweisungen", {
      method: "POST",
      body: fd,
    }),
    locals: { session: user ? { user } : null },
  } as unknown as Parameters<(typeof actions)["bulk-mark-erstattet"]>[0];
}

describe("/app/ausgaben/ueberweisungen load", () => {
  it("returns claims + zahlungsarten", async () => {
    const data = (await load({} as never)) as {
      claims: { id: string }[];
      zahlungsarten: { id: string }[];
    };
    expect(listApprovedPendingErstattetMock).toHaveBeenCalledOnce();
    expect(data.claims[0]!.id).toBe("exp-open-1");
    expect(data.zahlungsarten[0]!.id).toBe("za-bank");
  });
});

describe("/app/ausgaben/ueberweisungen ?/bulk-mark-erstattet", () => {
  const FORM = {
    expenseIds: "exp-1,exp-2",
    chosenDate: "2026-06-11",
    zahlungsartId: "0c8ed94c-95f0-4b9e-9a7a-2f54bb6db0b1",
  };

  it("marks each expense (one markExpenseErstattet per row) and returns per-row results + summary", async () => {
    const result = (await actions["bulk-mark-erstattet"](
      actionEvent(FORM, { id: "user-1" }),
    )) as {
      ok: boolean;
      results: { id: string; status: string }[];
      summary: { erstattet: string[] };
    };
    expect(markExpenseErstattetMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { id: "exp-1", status: "erstattet" },
      { id: "exp-2", status: "erstattet" },
    ]);
    expect(result.summary.erstattet).toEqual(["exp-1", "exp-2"]);
  });

  it("maps a festschreibung 409 to the festgeschrieben bucket (partial outcome, not failure)", async () => {
    markExpenseErstattetMock
      .mockResolvedValueOnce({ ok: true, alreadyErstattet: false })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        error: "festgeschrieben",
      });
    const result = (await actions["bulk-mark-erstattet"](
      actionEvent(FORM, { id: "user-1" }),
    )) as {
      ok: boolean;
      summary: { erstattet: string[]; festgeschrieben: string[] };
    };
    expect(result.ok).toBe(true);
    expect(result.summary.erstattet).toEqual(["exp-1"]);
    expect(result.summary.festgeschrieben).toEqual(["exp-2"]);
  });

  it("maps already-reimbursed rows to bereits-erstattet", async () => {
    markExpenseErstattetMock.mockResolvedValue({
      ok: true,
      alreadyErstattet: true,
    });
    const result = (await actions["bulk-mark-erstattet"](
      actionEvent({ ...FORM, expenseIds: "exp-1" }, { id: "user-1" }),
    )) as { results: { status: string }[] };
    expect(result.results[0]!.status).toBe("bereits-erstattet");
  });

  it("422 on invalid input, 401 when signed out", async () => {
    const bad = (await actions["bulk-mark-erstattet"](
      actionEvent({ ...FORM, zahlungsartId: "not-a-uuid" }, { id: "user-1" }),
    )) as { status: number };
    expect(bad.status).toBe(422);
    const anon = (await actions["bulk-mark-erstattet"](
      actionEvent(FORM, null),
    )) as { status: number };
    expect(anon.status).toBe(401);
  });
});
