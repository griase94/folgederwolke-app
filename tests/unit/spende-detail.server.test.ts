/**
 * @vitest-environment node
 * @phase-6-spenden
 *
 * Task 6 — the /app/spenden/[id] detail route.
 *
 *   load:     getTransactionDetail(id, "donation"); 404 when missing; exposes
 *             isFestgeschrieben + the threaded §4.3 donation fields.
 *   ?/save:   editSpende + festschreibung/bescheinigt gate (409 when bescheinigt).
 *   ?/delete: hard-delete pre-Bescheinigung, blocked once bescheinigungNr set
 *             (409) — the rule moved here from the retired route.
 *
 * We mock getTransactionDetail + editSpende; the deeper edit/derive behaviour is
 * covered by the Task-4 integration test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getTransactionDetailMock = vi.fn();
const editSpendeMock = vi.fn();
const deleteDonationMock = vi.fn();

vi.mock("$lib/server/domain/transactions.js", () => ({
  getTransactionDetail: getTransactionDetailMock,
}));
vi.mock("$lib/server/domain/spenden.js", () => ({
  editSpende: editSpendeMock,
  isBescheinigungEnabled: () => true,
}));

// The detail route deletes via a small helper / direct db call; we stub the db
// layer so ?/delete is exercisable without a real DB.
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    delete: () => ({ where: deleteDonationMock }),
  }),
}));

const { load, actions } =
  await import("../../src/routes/app/spenden/[id]/+page.server.js");

const save = actions.save!;
const del = actions.delete!;

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    kind: "donation",
    businessId: "S-2026-001",
    bezeichnung: "Spende von Erika",
    betragCents: 5000,
    currency: "EUR",
    gebuchtAm: "2026-03-01T00:00:00.000Z",
    sphereSnapshot: "ideeller",
    kategorieNameSnapshot: "Geldspende zweckfrei",
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    spenderName: "Erika Externe",
    spenderAdresse: "Hauptstr. 1, 10115 Berlin",
    spenderEmail: null,
    bescheinigungNr: null,
    spendeKind: "geldspende",
    zweckbindungKind: "zweckfrei",
    zweckbindungText: null,
    wertermittlungMethode: null,
    zustandBeschreibung: null,
    herkunftsbelegFileId: null,
    betriebsvermoegen: false,
    belegFileId: null,
    timeline: [],
    ...overrides,
  };
}

function loadEvent(id = "d-1") {
  return { params: { id } } as unknown as never;
}

function actionEvent(
  id = "d-1",
  fields: Record<string, string> = {},
  userId: string | null = "user-1",
) {
  const fd = new FormData();
  fd.set("id", id);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    params: { id },
    request: { formData: async () => fd },
    locals: { session: userId ? { user: { id: userId } } : null },
  } as unknown as never;
}

async function expectFail(p: unknown): Promise<number> {
  const r = (await p) as { status: number };
  return r.status;
}

beforeEach(() => {
  getTransactionDetailMock.mockReset();
  editSpendeMock.mockReset();
  deleteDonationMock.mockReset();
  deleteDonationMock.mockResolvedValue(undefined);
});

describe("/app/spenden/[id] load", () => {
  it("exposes the threaded Sachspende Wertermittlung fields", async () => {
    getTransactionDetailMock.mockResolvedValue(
      detail({
        spendeKind: "sachspende",
        wertermittlungMethode: "marktpreis",
        zustandBeschreibung: "Gebraucht, gut erhalten",
        herkunftsbelegFileId: "f-1",
      }),
    );
    const data = (await load(loadEvent())) as {
      detail: {
        wertermittlungMethode: string | null;
        zustandBeschreibung: string | null;
        herkunftsbelegFileId: string | null;
      };
      isFestgeschrieben: boolean;
    };
    expect(getTransactionDetailMock).toHaveBeenCalledWith("d-1", "donation");
    expect(data.detail.wertermittlungMethode).toBe("marktpreis");
    expect(data.detail.zustandBeschreibung).toBe("Gebraucht, gut erhalten");
    expect(data.detail.herkunftsbelegFileId).toBe("f-1");
    expect(data.isFestgeschrieben).toBe(false);
  });

  it("404s when the donation is missing", async () => {
    getTransactionDetailMock.mockResolvedValue(null);
    await expect(load(loadEvent("nope"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("isFestgeschrieben true when festgeschriebenAt set", async () => {
    getTransactionDetailMock.mockResolvedValue(
      detail({ festgeschriebenAt: "2026-12-31T00:00:00.000Z" }),
    );
    const data = (await load(loadEvent())) as { isFestgeschrieben: boolean };
    expect(data.isFestgeschrieben).toBe(true);
  });
});

describe("/app/spenden/[id] ?/save", () => {
  it("delegates to editSpende and surfaces a 409 (bescheinigt)", async () => {
    editSpendeMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "bereits bescheinigt",
    });
    const status = await expectFail(
      save(actionEvent("d-1", { spende_kind: "geldspende" })),
    );
    expect(editSpendeMock).toHaveBeenCalledTimes(1);
    expect(status).toBe(409);
  });

  it("returns ok on a successful edit", async () => {
    editSpendeMock.mockResolvedValue({ ok: true });
    const r = (await save(
      actionEvent("d-1", { spende_kind: "geldspende" }),
    )) as {
      ok?: boolean;
    };
    expect(r.ok).toBe(true);
  });
});

describe("/app/spenden/[id] ?/delete", () => {
  it("blocks deletion once bescheinigt (409)", async () => {
    getTransactionDetailMock.mockResolvedValue(
      detail({ bescheinigungNr: "B-2026-001" }),
    );
    const status = await expectFail(del(actionEvent("d-1")));
    expect(status).toBe(409);
    expect(deleteDonationMock).not.toHaveBeenCalled();
  });

  it("blocks deletion when festgeschrieben (409)", async () => {
    getTransactionDetailMock.mockResolvedValue(
      detail({ festgeschriebenAt: "2026-12-31T00:00:00.000Z" }),
    );
    const status = await expectFail(del(actionEvent("d-1")));
    expect(status).toBe(409);
    expect(deleteDonationMock).not.toHaveBeenCalled();
  });

  it("deletes a pre-Bescheinigung donation then redirects to the list", async () => {
    getTransactionDetailMock.mockResolvedValue(detail());
    try {
      await del(actionEvent("d-1"));
      throw new Error("expected delete to redirect");
    } catch (err) {
      expect((err as { status: number }).status).toBe(303);
      expect((err as { location: string }).location).toBe("/app/spenden");
    }
    expect(deleteDonationMock).toHaveBeenCalledTimes(1);
  });
});
