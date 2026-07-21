/**
 * @vitest-environment node
 * @phase-5-einnahmen
 *
 * Phase 5 / Task 5 — the Einnahme detail route (Tier C2).
 *
 *   load(): getTransactionDetail(params.id, "income") → 404 when missing,
 *           exposes `isFestgeschrieben` + (when Rechnung-linked) the
 *           `rechnungBusinessId` for the read-only "aus Rechnung FDW-…" line.
 *   actions: ONLY `?/save` (festschreibung-gated update of the editable income
 *           fields). NO `?/mark-paid`, NO `?/duplicate` — Einnahmen has no
 *           payment workflow on its own detail.
 *
 * Mocks getTransactionDetail + the festschreibung gate + a fake db so the
 * route is exercisable WITHOUT a real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

interface FakeDetail {
  id: string;
  kind: "income";
  bezeichnung: string;
  betragCents: number;
  yearOfBuchung: number | null;
  festgeschriebenAt: string | null;
  belegFileId: string | null;
  belegMimeType: string | null;
  belegOriginalName: string | null;
  rechnungBusinessId: string | null;
  kommentar: string | null;
}

const detailStore = new Map<string, FakeDetail>();

const getTransactionDetailMock = vi.fn(
  async (id: string, _kind: "income") => detailStore.get(id) ?? null,
);
type GateResult = { ok: true } | { ok: false; status: number; error: string };
const checkFestschreibungGateMock = vi.fn(
  async (_year: number): Promise<GateResult> => ({ ok: true }),
);

// §4.5: ?/save re-derives the Sphäre from the Kategorie server-side. The mock
// returns a FIXED sphere ("zweckbetrieb") regardless of any client-posted
// sphere, so the test can prove the save ignores the body's sphere.
const resolveKategorieByNameMock = vi.fn(
  async (_kind: "income", name: string | undefined) => ({
    id: "kat-x",
    name: name ?? "Aufnahmegebühr",
    sphere: "zweckbetrieb" as const,
  }),
);

vi.mock("$lib/server/domain/transactions.js", () => ({
  getTransactionDetail: getTransactionDetailMock,
  checkFestschreibungGate: checkFestschreibungGateMock,
  resolveKategorieByName: resolveKategorieByNameMock,
}));

// load() also fetches kategorie options for the detail fields picker.
vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: vi.fn(async (_kind: "income") => [
    {
      id: "kat-income-1",
      kind: "income",
      name: "Aufnahmegebühr",
      sphere: "ideeller",
      sortOrder: 0,
      deactivated: false,
    },
  ]),
}));

// Minimal event-bus stub so income.updated emit() is a no-op.
vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: vi.fn(async () => {}) },
}));

// Fake db — satisfies db.update(income).set(...).where(...) (save),
// db.select(...).from(projects).where(...).orderBy(...) (load → empty list),
// db.select(...).from(invoices).where(...).limit(1) (delete invoice guard),
// and db.delete(income).where(...).returning(...) (delete).
const updateCalls: { set?: Record<string, unknown> }[] = [];
// Configurable per-test: the linked-invoice rows the delete guard select sees,
// and the rows the DELETE ... RETURNING returns (empty = guard/festschr. race).
let invoiceRows: { id: string; businessId: string }[] = [];
let deleteReturns: { id: string }[] = [{ id: "inc-free" }];
let deleteCalls = 0;
function makeDbFake() {
  return {
    update() {
      const ctx: { set?: Record<string, unknown> } = {};
      const chain = {
        set(values: Record<string, unknown>) {
          ctx.set = values;
          return chain;
        },
        where() {
          updateCalls.push(ctx);
          return Promise.resolve();
        },
      };
      return chain;
    },
    select() {
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return Promise.resolve([] as unknown[]);
        },
        limit() {
          return Promise.resolve(invoiceRows);
        },
      };
      return chain;
    },
    delete() {
      const chain = {
        where() {
          return chain;
        },
        returning() {
          deleteCalls += 1;
          return Promise.resolve(deleteReturns);
        },
      };
      return chain;
    },
  };
}
const dbFake = makeDbFake();
vi.mock("$lib/server/db/index.js", () => ({ getDb: () => dbFake }));

vi.mock("$lib/server/db/schema/income.js", () => ({
  income: { _kind: "income", id: "id", festgeschriebenAt: "festgeschriebenAt" },
}));
vi.mock("$lib/server/db/schema/invoices.js", () => ({
  invoices: {
    _kind: "invoices",
    id: "id",
    businessId: "businessId",
    paidByIncomeId: "paidByIncomeId",
  },
}));
vi.mock("$lib/server/db/schema/projects.js", () => ({
  projects: {
    _kind: "projects",
    id: "id",
    name: "name",
    deletedAt: "deletedAt",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, eq: (col: unknown, val: unknown) => ({ col, val }) };
});

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { load, actions } =
  await import("../../src/routes/app/einnahmen/[id]/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINKED: FakeDetail = {
  id: "inc-linked",
  kind: "income",
  bezeichnung: "Beitrag aus Rechnung",
  betragCents: 12000,
  yearOfBuchung: 2026,
  festgeschriebenAt: null,
  belegFileId: null,
  belegMimeType: null,
  belegOriginalName: null,
  rechnungBusinessId: "FDW-2026-014",
  kommentar: null,
};
const FREE: FakeDetail = {
  id: "inc-free",
  kind: "income",
  bezeichnung: "Spende bar",
  betragCents: 5000,
  yearOfBuchung: 2026,
  festgeschriebenAt: null,
  belegFileId: "file-1",
  belegMimeType: "application/pdf",
  belegOriginalName: "beleg.pdf",
  rechnungBusinessId: null,
  kommentar: null,
};
const FROZEN: FakeDetail = {
  ...FREE,
  id: "inc-frozen",
  festgeschriebenAt: "2026-01-01T00:00:00.000Z",
};

function makeLoadEvent(id: string) {
  return { params: { id } } as unknown as never;
}

function makeSaveEvent(
  id: string,
  fields: Record<string, string>,
  user: { id: string } | null = { id: "user-1" },
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: new Request(`http://test.local/app/einnahmen/${id}`, {
      method: "POST",
      body: fd,
    }),
    params: { id },
    locals: { session: user ? { user } : null },
  } as unknown as never;
}

async function runLoad(id: string): Promise<{
  status?: number;
  data?: { isFestgeschrieben: boolean; detail: FakeDetail };
}> {
  try {
    const data = (await (load as (e: never) => Promise<unknown>)(
      makeLoadEvent(id),
    )) as { isFestgeschrieben: boolean; detail: FakeDetail };
    return { data };
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      return { status: (err as { status: number }).status };
    }
    throw err;
  }
}

async function runSave(
  event: never,
): Promise<{ fail?: { status: number }; ok?: unknown }> {
  const result = await (actions.save as (e: never) => Promise<unknown>)(event);
  const r = result as { status?: number };
  if (
    r &&
    typeof r === "object" &&
    "status" in r &&
    typeof r.status === "number"
  ) {
    return { fail: { status: r.status } };
  }
  return { ok: result };
}

async function runDelete(
  id: string,
  user: { id: string } | null = { id: "user-1" },
): Promise<{ fail?: { status: number; error?: string }; redirect?: number }> {
  const event = {
    params: { id },
    locals: { session: user ? { user } : null },
  } as unknown as never;
  try {
    const result = await (
      actions as { delete: (e: never) => Promise<unknown> }
    ).delete(event);
    const r = result as { status?: number; data?: { error?: string } };
    return { fail: { status: r.status ?? 0, error: r.data?.error } };
  } catch (err) {
    // A successful delete throws SvelteKit's redirect(303).
    if (err && typeof err === "object" && "status" in err) {
      return { redirect: (err as { status: number }).status };
    }
    throw err;
  }
}

beforeEach(() => {
  detailStore.clear();
  detailStore.set(LINKED.id, { ...LINKED });
  detailStore.set(FREE.id, { ...FREE });
  detailStore.set(FROZEN.id, { ...FROZEN });
  getTransactionDetailMock.mockClear();
  checkFestschreibungGateMock.mockClear();
  checkFestschreibungGateMock.mockResolvedValue({ ok: true });
  updateCalls.length = 0;
  invoiceRows = [];
  deleteReturns = [{ id: "inc-free" }];
  deleteCalls = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/app/einnahmen/[id] load", () => {
  it("fetches the income detail and exposes isFestgeschrieben (false when open)", async () => {
    const r = await runLoad(FREE.id);
    expect(getTransactionDetailMock).toHaveBeenCalledWith(FREE.id, "income");
    expect(r.data?.detail.id).toBe(FREE.id);
    expect(r.data?.isFestgeschrieben).toBe(false);
  });

  it("404s when the income row is missing", async () => {
    const r = await runLoad("does-not-exist");
    expect(r.status).toBe(404);
  });

  it("marks isFestgeschrieben true when the row carries festgeschriebenAt", async () => {
    const r = await runLoad(FROZEN.id);
    expect(r.data?.isFestgeschrieben).toBe(true);
  });

  it("exposes rechnungBusinessId for the read-only 'aus Rechnung FDW-…' line when linked", async () => {
    const linked = await runLoad(LINKED.id);
    expect(linked.data?.detail.rechnungBusinessId).toBe("FDW-2026-014");
    const free = await runLoad(FREE.id);
    expect(free.data?.detail.rechnungBusinessId).toBeNull();
  });
});

describe("/app/einnahmen/[id] actions", () => {
  it("exposes `save` + `delete` (no mark-paid, no duplicate)", () => {
    expect(typeof actions.save).toBe("function");
    expect(typeof (actions as Record<string, unknown>).delete).toBe("function");
    expect((actions as Record<string, unknown>)["mark-paid"]).toBeUndefined();
    expect((actions as Record<string, unknown>).duplicate).toBeUndefined();
    expect(Object.keys(actions)).toEqual(["save", "delete"]);
  });

  it("?/save updates the editable income fields (gate ok)", async () => {
    const r = await runSave(
      makeSaveEvent(FREE.id, {
        bezeichnung: "Spende bar (korr.)",
        betragCents: "5500",
        kommentar: "nachgetragen",
      }),
    );
    expect(r.fail).toBeUndefined();
    expect(checkFestschreibungGateMock).toHaveBeenCalled();
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0]!.set!.bezeichnung).toBe("Spende bar (korr.)");
  });

  it("?/save re-derives the Sphäre from the Kategorie server-side, ignoring a tampered client sphere (§4.5)", async () => {
    const r = await runSave(
      makeSaveEvent(FREE.id, {
        bezeichnung: "Honorar Workshop",
        betragCents: "12000",
        kategorieNameSnapshot: "Honorar",
        // A tampered/stale client sphere that must NOT be persisted.
        sphereSnapshot: "wirtschaftlich",
      }),
    );
    expect(r.fail).toBeUndefined();
    expect(resolveKategorieByNameMock).toHaveBeenCalledWith(
      "income",
      "Honorar",
    );
    // The persisted sphere is the RESOLVED one ("zweckbetrieb"), NOT the
    // tampered body value ("wirtschaftlich"); name comes from the resolver too.
    expect(updateCalls[0]!.set!.sphereSnapshot).toBe("zweckbetrieb");
    expect(updateCalls[0]!.set!.kategorieNameSnapshot).toBe("Honorar");
  });

  it("?/save is festschreibung-gated (gate fail → fail(status), no update)", async () => {
    checkFestschreibungGateMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "Jahr 2026 ist festgeschrieben",
    });
    const r = await runSave(
      makeSaveEvent(FREE.id, { bezeichnung: "x", betragCents: "100" }),
    );
    expect(r.fail?.status).toBe(409);
    expect(updateCalls.length).toBe(0);
  });

  it("?/save rejects when the row itself is festgeschrieben (409, no update)", async () => {
    const r = await runSave(
      makeSaveEvent(FROZEN.id, { bezeichnung: "x", betragCents: "100" }),
    );
    expect(r.fail?.status).toBe(409);
    expect(updateCalls.length).toBe(0);
  });

  it("?/save rejects an unauthenticated caller (401, no update)", async () => {
    const r = await runSave(
      makeSaveEvent(FREE.id, { bezeichnung: "x", betragCents: "100" }, null),
    );
    expect(r.fail?.status).toBe(401);
    expect(updateCalls.length).toBe(0);
  });
});

describe("/app/einnahmen/[id] ?/delete", () => {
  it("HARD GUARD: an income referenced by invoices.paid_by_income_id → 409 with the EXACT German pointer, no delete", async () => {
    invoiceRows = [{ id: "inv-1", businessId: "FDW-2026-014" }];
    const r = await runDelete(LINKED.id);
    expect(r.fail?.status).toBe(409);
    // The exact string is a contract the UI toast surfaces verbatim.
    expect(r.fail?.error).toBe(
      "Diese Einnahme gehört zur Zahlung von Rechnung FDW-2026-014. Nimm zuerst die Zahlung auf der Rechnung zurück.",
    );
    expect(deleteCalls).toBe(0);
  });

  it("a free (non-invoice-linked) income deletes and redirects (303)", async () => {
    invoiceRows = [];
    deleteReturns = [{ id: FREE.id }];
    const r = await runDelete(FREE.id);
    expect(r.redirect).toBe(303);
    expect(deleteCalls).toBe(1);
  });

  it("a festgeschrieben income → 409, never reaches the invoice guard or delete", async () => {
    const r = await runDelete(FROZEN.id);
    expect(r.fail?.status).toBe(409);
    expect(deleteCalls).toBe(0);
  });

  it("rejects an unauthenticated caller (401)", async () => {
    const r = await runDelete(FREE.id, null);
    expect(r.fail?.status).toBe(401);
    expect(deleteCalls).toBe(0);
  });
});
