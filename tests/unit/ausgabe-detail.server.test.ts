/**
 * @vitest-environment node
 * @phase-4-ausgaben
 *
 * Unit tests for the Ausgabe detail route `/app/ausgaben/[id]/+page.server.ts`
 * — Phase 4 (Tier C1), Task 5.
 *
 *   load        → getTransactionDetail(id, "expense"); 404 when missing;
 *                 exposes isFestgeschrieben.
 *   ?/save      → festschreibung-gated inline UPDATE (ported from the legacy
 *                 transactions/[id] route — there is no exported updateExpense).
 *   ?/mark-paid → reuses markExpenseAsPaid(id, { datum, zahlartId, actorUserId })
 *                 (POSITIONAL, no-mail path) + festschreibung gate.
 *   ?/duplicate → returns a prefill from the DESCRIPTIVE fields only and RESETS
 *                 the payment state (no erstattetAm / zahlungsartId / status, never
 *                 a Beleg) — the critical recurring-Miete safety (spec §7.2).
 *
 * All deps mocked; no real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const ERSTATTET_DETAIL = {
  id: "exp-1",
  kind: "expense" as const,
  businessId: "A-2026-001",
  bezeichnung: "Raummiete März",
  betragCents: 45000,
  currency: "EUR",
  gebuchtAm: "2026-03-02T00:00:00.000Z",
  rechnungsdatum: "2026-03-01",
  sphereSnapshot: "ideeller",
  sphereEffective: "ideeller",
  kategorieNameSnapshot: "Miete",
  status: "erstattet",
  erstattetAm: "2026-03-05",
  bezahltVonDisplay: "Folge der Wolke e.V.",
  festgeschriebenAt: null as string | null,
  yearOfBuchung: 2026,
  kommentar: "monatlich",
  projectId: null,
  zahlungsartId: "22222222-2222-4222-8222-222222222222",
  externIban: null,
  externEmail: null,
  externName: null,
  bezahltVonMemberId: null,
  belegDriveFileId: null,
  belegFileId: "file-1",
  belegMimeType: "application/pdf",
  belegOriginalName: "miete.pdf",
  approvedAt: "2026-03-02T00:00:00.000Z",
  rechnungBusinessId: null,
  spenderName: null,
  spenderEmail: null,
  spenderAdresse: null,
  bescheinigungNr: null,
  spendeKind: null,
  zweckbindungKind: null,
  zweckbindungText: null,
  wertermittlungMethode: null,
  zustandBeschreibung: null,
  herkunftsbelegFileId: null,
  betriebsvermoegen: null,
  timeline: [],
};

const getTransactionDetailMock = vi.fn(
  async (id: string, _kind: string): Promise<typeof ERSTATTET_DETAIL | null> =>
    id === "missing" ? null : ERSTATTET_DETAIL,
);
const markExpenseAsPaidMock = vi.fn(async (_id: string, _params: unknown) => ({
  ok: true as const,
}));
const checkFestschreibungGateMock = vi.fn(async (_year: number) => ({
  ok: true as const,
}));
const listZahlungsartenMock = vi.fn(async () => [
  { id: "22222222-2222-4222-8222-222222222222", kind: "bank", label: "Bank" },
]);
// §4.5: ?/save re-derives sphere from the picked Kategorie name (never trusts
// the body). The fixture Kategorie "Miete" resolves to sphere "wirtschaftlich"
// here so the test can prove the body's tampered sphere is overridden.
const resolveKategorieByNameMock = vi.fn(
  async (_kind: "expense", name: string) => ({
    id: "kat-miete",
    name,
    sphere: "wirtschaftlich" as const,
  }),
);

vi.mock("$lib/server/domain/transactions.js", () => ({
  getTransactionDetail: getTransactionDetailMock,
  markExpenseAsPaid: markExpenseAsPaidMock,
  checkFestschreibungGate: checkFestschreibungGateMock,
  listZahlungsarten: listZahlungsartenMock,
  resolveKategorieByName: resolveKategorieByNameMock,
}));

// load() also fetches expense kategorie options + the active-projects list for
// the editable detail fields. Mock both so load() stays DB-light.
vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: async (kind: "expense") => [
    { id: "kat-miete", kind, name: "Miete", sphere: "ideeller" },
  ],
}));

// Bus + DB (update for ?/save; select for load's projects list).
const busEmitMock = vi.fn(async () => {});
vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: busEmitMock },
}));

const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
function makeDbFake() {
  const updateChain = {
    set(values: Record<string, unknown>) {
      updateSetMock(values);
      return updateChain;
    },
    where(cond: unknown) {
      updateWhereMock(cond);
      return Promise.resolve();
    },
  };
  const selectChain = {
    from() {
      return selectChain;
    },
    where() {
      return selectChain;
    },
    orderBy() {
      return Promise.resolve([] as unknown[]);
    },
  };
  return { update: () => updateChain, select: () => selectChain };
}
vi.mock("$lib/server/db/index.js", () => ({ getDb: () => makeDbFake() }));
vi.mock("$lib/server/db/schema/expenses.js", () => ({
  expenses: { id: "id", festgeschriebenAt: "festgeschriebenAt" },
}));
vi.mock("$lib/server/db/schema/projects.js", () => ({
  projects: { id: "id", name: "name", deletedAt: "deletedAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  isNull: (a: unknown) => ({ isNull: a }),
  and: (...conds: unknown[]) => ({ and: conds }),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

const mod = await import("../../src/routes/app/ausgaben/[id]/+page.server.js");
const { load } = mod;
const actions = mod.actions as unknown as Record<
  string,
  (e: ActionEvent) => Promise<unknown>
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LoadEvent {
  params: { id: string };
}
interface ActionEvent {
  request: Request;
  params: { id: string };
  locals: { session: { user: { id: string } } | null };
}

function makeActionEvent(
  id: string,
  fields: Record<string, string>,
  user: { id: string } | null = { id: "user-1" },
): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: new Request(`http://test.local/app/ausgaben/${id}`, {
      method: "POST",
      body: fd,
    }),
    params: { id },
    locals: { session: user ? { user } : null },
  };
}

async function runLoad(id: string): Promise<unknown> {
  try {
    return await (load as (e: LoadEvent) => Promise<unknown>)({
      params: { id },
    });
  } catch (err) {
    return { thrown: err };
  }
}

beforeEach(() => {
  getTransactionDetailMock.mockClear();
  markExpenseAsPaidMock.mockClear();
  checkFestschreibungGateMock.mockClear();
  resolveKategorieByNameMock.mockClear();
  updateSetMock.mockClear();
  updateWhereMock.mockClear();
  busEmitMock.mockClear();
});

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

describe("ausgaben/[id] load", () => {
  it("loads the expense detail + zahlungsarten + isFestgeschrieben=false", async () => {
    const data = (await runLoad("exp-1")) as {
      detail: { id: string };
      isFestgeschrieben: boolean;
      zahlungsarten: unknown[];
    };
    expect(getTransactionDetailMock).toHaveBeenCalledWith("exp-1", "expense");
    expect(data.detail.id).toBe("exp-1");
    expect(data.isFestgeschrieben).toBe(false);
    expect(data.zahlungsarten).toHaveLength(1);
  });

  it("404s when the expense does not exist", async () => {
    const r = (await runLoad("missing")) as { thrown?: { status?: number } };
    expect(r.thrown?.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// ?/mark-paid
// ---------------------------------------------------------------------------

describe("ausgaben/[id] ?/mark-paid", () => {
  it("reuses markExpenseAsPaid(id, { datum, zahlartId, actorUserId }) + festschreibung gate", async () => {
    const event = makeActionEvent("exp-1", {
      datum: "2026-03-06",
      zahlartId: "22222222-2222-4222-8222-222222222222",
    });
    const result = (await actions["mark-paid"]!(event)) as { ok?: boolean };
    expect(checkFestschreibungGateMock).toHaveBeenCalled();
    expect(markExpenseAsPaidMock).toHaveBeenCalledTimes(1);
    const [id, params] = markExpenseAsPaidMock.mock.calls[0]! as [
      string,
      { datum: string; zahlartId: string | null; actorUserId: string },
    ];
    expect(id).toBe("exp-1");
    expect(params.datum).toBe("2026-03-06");
    expect(params.zahlartId).toBe("22222222-2222-4222-8222-222222222222");
    expect(params.actorUserId).toBe("user-1");
    expect(result.ok).toBe(true);
  });

  it("rejects when not signed in", async () => {
    const event = makeActionEvent("exp-1", { datum: "2026-03-06" }, null);
    const result = (await actions["mark-paid"]!(event)) as { status?: number };
    expect(result.status).toBe(401);
    expect(markExpenseAsPaidMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ?/duplicate — payment-state reset (spec §7.2 recurring-Miete safety)
// ---------------------------------------------------------------------------

describe("ausgaben/[id] ?/duplicate", () => {
  it("resets payment state (no erstattetAm/zahlungsart/status, no beleg) but carries descriptive fields", async () => {
    const event = makeActionEvent("exp-1", {});
    const result = (await actions["duplicate"]!(event)) as {
      prefill: Record<string, unknown>;
    };
    const { prefill } = result;
    // Payment state MUST be reset.
    expect(prefill.erstattetAm).toBeUndefined();
    expect(prefill.zahlungsartId).toBeUndefined();
    expect(prefill.status).toBeUndefined();
    expect(prefill.belegFileId).toBeUndefined();
    // Descriptive fields carry over (the point of duplicate-as-template).
    expect(prefill.bezeichnung).toBe("Raummiete März");
    expect(prefill.betragCents).toBe(45000);
    expect(prefill.kategorieNameSnapshot).toBe("Miete");
  });
});

// ---------------------------------------------------------------------------
// ?/save — festschreibung-gated inline update (ported)
// ---------------------------------------------------------------------------

describe("ausgaben/[id] ?/save", () => {
  it("updates the editable fields when not festgeschrieben", async () => {
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Raummiete April",
      betragCents: "46000",
      rechnungsdatum: "2026-04-01",
      kommentar: "monatlich",
      kategorieNameSnapshot: "Miete",
    });
    const result = (await actions["save"]!(event)) as { ok?: boolean };
    expect(result.ok).toBe(true);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const setArg = updateSetMock.mock.calls[0]![0] as { bezeichnung: string };
    expect(setArg.bezeichnung).toBe("Raummiete April");
    expect(busEmitMock).toHaveBeenCalled();
  });

  it("re-derives sphere from the Kategorie server-side — a tampered sphereSnapshot is ignored (§4.5)", async () => {
    // The body claims "ideeller", but the picked Kategorie ("Miete") resolves to
    // "wirtschaftlich". The write MUST use the resolved sphere, never the body's.
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Raummiete April",
      betragCents: "46000",
      kategorieNameSnapshot: "Miete",
      sphereSnapshot: "ideeller",
    });
    const result = (await actions["save"]!(event)) as { ok?: boolean };
    expect(result.ok).toBe(true);
    expect(resolveKategorieByNameMock).toHaveBeenCalledWith("expense", "Miete");
    const setArg = updateSetMock.mock.calls[0]![0] as {
      sphereSnapshot: string;
      kategorieNameSnapshot: string;
    };
    // Derived from the Kategorie, NOT the tampered body value.
    expect(setArg.sphereSnapshot).toBe("wirtschaftlich");
    expect(setArg.kategorieNameSnapshot).toBe("Miete");
  });

  it("guards the UPDATE atomically with isNull(festgeschriebenAt) in the WHERE (TOCTOU)", async () => {
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Raummiete April",
      betragCents: "46000",
      kategorieNameSnapshot: "Miete",
    });
    await actions["save"]!(event);
    expect(updateWhereMock).toHaveBeenCalledTimes(1);
    // The WHERE must reference the festgeschriebenAt IS NULL guard, not just id.
    const whereArg = JSON.stringify(updateWhereMock.mock.calls[0]![0]);
    expect(whereArg).toContain("festgeschriebenAt");
    expect(whereArg).toContain("isNull");
  });

  it("rejects an empty Kategorie with 422 (mandatory-Kategorie refine)", async () => {
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Raummiete April",
      betragCents: "46000",
      kategorieNameSnapshot: "",
    });
    const result = (await actions["save"]!(event)) as { status?: number };
    expect(result.status).toBe(422);
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("rejects the (Unkategorisiert) sentinel Kategorie with 422", async () => {
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Raummiete April",
      betragCents: "46000",
      kategorieNameSnapshot: "(Unkategorisiert)",
    });
    const result = (await actions["save"]!(event)) as { status?: number };
    expect(result.status).toBe(422);
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("blocks the update with 409 when the expense is festgeschrieben", async () => {
    getTransactionDetailMock.mockResolvedValueOnce({
      ...ERSTATTET_DETAIL,
      festgeschriebenAt: "2026-12-31T00:00:00.000Z",
    });
    const event = makeActionEvent("exp-1", {
      bezeichnung: "Hack",
      betragCents: "1",
      kategorieNameSnapshot: "Miete",
    });
    const result = (await actions["save"]!(event)) as { status?: number };
    expect(result.status).toBe(409);
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in", async () => {
    const event = makeActionEvent(
      "exp-1",
      { bezeichnung: "x", betragCents: "1" },
      null,
    );
    const result = (await actions["save"]!(event)) as { status?: number };
    expect(result.status).toBe(401);
  });
});
