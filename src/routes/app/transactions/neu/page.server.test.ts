/**
 * @vitest-environment node
 * @phase-5
 *
 * Unit tests for the /app/transactions/neu `create` action — cluster C4.
 *
 * P1-T7 (spec §4.5): sphere derivation moved OUT of this action and INTO the
 * domain create fns. createExpense/createIncome now resolve the picked
 * Kategorie by NAME and derive sphere STRICTLY from it — there is NO project
 * `sphereDefault` override anymore (the cycle-2 ADR-0008 override added in
 * PR #45 B1 is intentionally removed by Phase-1). The action's remaining job
 * is to validate input and FORWARD the picked kategorieNameSnapshot to the
 * domain layer; it must not hand-compute/forward a project-override sphere.
 *
 * The actual sphere-derivation contract (expense→ideeller etc.) is owned and
 * DB-verified by tests/unit/create-expense-income-kategorie.test.ts. These
 * mock-based tests only assert the action's forwarding behavior.
 *
 * Strategy: mock every dependency the action touches so we can drive the
 * handler with a synthesized FormData + locals.session, then assert on the
 * args captured by the createExpense / createIncome mocks. We don't need a
 * real DB here — the action's job is to feed the domain fn the right inputs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — must be declared before SUT import
// ---------------------------------------------------------------------------

// Fake project store. The action under test loads the project's
// sphereDefault when projectId is set. We back the db.select(...).where(...)
// .limit(1) chain with this map.
const projectStore = new Map<
  string,
  { id: string; sphereDefault: "ideeller" | "wirtschaftlich" | null }
>();

const createExpenseMock = vi.fn(async (input: { sphereSnapshot: string }) => ({
  id: "exp-new-1",
  businessId: input ? "AUS-2026-001" : "AUS-2026-001",
}));
const createIncomeMock = vi.fn(async (input: { sphereSnapshot: string }) => ({
  id: "inc-new-1",
  businessId: input ? "E-2026-001" : "E-2026-001",
}));
const createDonationMock = vi.fn(async () => ({
  id: "don-new-1",
  businessId: "S-2026-001",
}));

vi.mock("$lib/server/domain/transactions.js", () => ({
  createExpense: createExpenseMock,
  createIncome: createIncomeMock,
  createDonation: createDonationMock,
  checkFestschreibungGate: async () => ({ ok: true as const }),
  listZahlungsarten: async () => [],
}));

vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: async (kind: string, year: number) =>
    `${kind}-${year}-001`,
}));

vi.mock("$lib/server/domain/transaction-pickers.js", async () => {
  // P1-T7 (§4.5): the create branch no longer re-derives sphere — that moved
  // into createExpense/createIncome (DB-verified elsewhere). listKategorieOptions
  // and the projects lookup are now consumed only by load(); we stub
  // listKategorieOptions (it hits the DB) with a known fixture so load() and the
  // action's input plumbing stay exercisable without a real DB. `projectStore`
  // is retained purely as an armed trap for the no-override contract (see tests).
  const actual = await vi.importActual<
    typeof import("$lib/server/domain/transaction-pickers.js")
  >("$lib/server/domain/transaction-pickers.js");
  return {
    ...actual,
    listKategorieOptions: async (kind: "expense" | "income") =>
      kind === "expense"
        ? [
            {
              id: "kat-verpflegung",
              kind: "expense",
              name: "Verpflegung",
              sphere: "ideeller",
              sortOrder: 0,
              deactivated: false,
            },
          ]
        : [
            {
              id: "kat-honorar",
              kind: "income",
              name: "Honorar",
              sphere: "ideeller",
              sortOrder: 0,
              deactivated: false,
            },
          ],
    loadRecentKategorieUsage: async () => [],
  };
});

// Drizzle's `eq(col, val)` — we only need it to be threadable through the
// fake .where() and report back which value we matched on.
vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: (col: string, val: unknown) => ({ field: col, value: val }),
    and: (a: unknown) => a,
    asc: (c: unknown) => c,
  };
});

vi.mock("$lib/server/db/schema/projects.js", () => ({
  projects: {
    _kind: "projects",
    id: "id",
    sphereDefault: "sphereDefault",
  },
}));

// C2-TAX — mock the Beleg upload helper so the action doesn't hit Drive/DB.
// Returns a deterministic fileId so the createExpense mock can assert it.
const handleAuslageUploadMock = vi.fn(async () => ({
  fileId: "file-c2-test-1",
  dedupHit: false,
  sniffedMimeType: "application/pdf",
  sanitizedFilename: "beleg.pdf",
}));
vi.mock("$lib/server/files/handleAuslageUpload.js", () => ({
  handleAuslageUpload: handleAuslageUploadMock,
}));

vi.mock("$lib/server/db/schema/members.js", () => ({
  members: {
    _kind: "members",
    id: "id",
    vorname: "vorname",
    nachname: "nachname",
    email: "email",
    iban: "iban",
  },
}));

// Minimal drizzle-shaped fake: only needs to satisfy
//   db.select().from(projects).where(eq(projects.id, X)).limit(1)
// used inside the action handler to look up project.sphereDefault.
function makeDbFake() {
  function select() {
    const ctx: { table: string; whereValue?: unknown } = { table: "" };
    const chain = {
      from(table: { _kind?: string }) {
        ctx.table = table._kind ?? "";
        return chain;
      },
      where(cond: { value: unknown }) {
        ctx.whereValue = cond?.value;
        return chain;
      },
      limit() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown) {
        let rows: unknown[] = [];
        if (ctx.table === "projects") {
          const proj = projectStore.get(ctx.whereValue as string);
          rows = proj ? [proj] : [];
        } else if (ctx.table === "members") {
          rows = [];
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  }
  return { select };
}

const dbFake = makeDbFake();
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => dbFake,
}));

// ---------------------------------------------------------------------------
// SUT — import AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

// Note: this test file is named `page.server.test.ts` (no leading `+`)
// because SvelteKit reserves `+`-prefixed filenames inside `src/routes` for
// actual route modules. Vitest still picks it up via the
// `src/**/*.test.ts` glob in vitest.config.ts.
const { actions, load } = await import("./+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } };
}

function makeEvent(formFields: Record<string, string | File>): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(formFields)) fd.set(k, v);
  const request = new Request("http://test.local/app/transactions/neu", {
    method: "POST",
    body: fd,
  });
  return {
    request,
    locals: { session: { user: { id: "user-test-1" } } },
  };
}

// C2-TAX — minimal valid PDF for the Beleg-required gate. file-type sniffs
// %PDF- magic bytes at offset 0. Kept small so the action's size cap
// doesn't reject it.
function mkBelegFile(): File {
  const buf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF\n",
    "utf-8",
  );
  return new File([buf], "beleg.pdf", { type: "application/pdf" });
}

// Action handlers throw the redirect on success; wrap so we can assert.
async function runCreate(event: ActionEvent): Promise<{
  redirect?: { status: number; location: string };
  fail?: unknown;
}> {
  try {
    const result = await (
      actions.create as (e: ActionEvent) => Promise<unknown>
    )(event);
    return { fail: result };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      "location" in err
    ) {
      return {
        redirect: {
          status: (err as { status: number }).status,
          location: (err as { location: string }).location,
        },
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  projectStore.clear();
  createExpenseMock.mockClear();
  createIncomeMock.mockClear();
  createDonationMock.mockClear();
});

const BAR_POPUP_PROJECT_ID = "11111111-1111-4111-8111-111111111111";

// P1-T7 (spec §4.5) UPDATE: sphere derivation moved OUT of this action and
// INTO the domain create fns (createExpense/createIncome resolve the picked
// Kategorie by name and derive sphere STRICTLY from it — NO project override).
// The cycle-2 ADR-0008 project-override behavior is intentionally removed by
// Phase-1 §4.5. These mock-based tests therefore no longer assert a
// server-computed sphereSnapshot (that contract is now owned + DB-verified by
// tests/unit/create-expense-income-kategorie.test.ts). What this action MUST
// still do is forward the validated kategorieNameSnapshot to the domain fn and
// NOT hand-compute/forward a project-override sphere.
describe("/app/transactions/neu — create action forwards Kategorie name (§4.5)", () => {
  it("expense: forwards kategorieNameSnapshot + client sphere verbatim; no project override (armed trap)", async () => {
    // ARMED TRAP: the project's sphereDefault is "wirtschaftlich". Under the
    // old ADR-0008 path the action would have REWRITTEN sphereSnapshot to
    // "wirtschaftlich". §4.5 STRICT forbids that — the action forwards inputs
    // verbatim and lets createExpense derive the real sphere from the Kategorie.
    projectStore.set(BAR_POPUP_PROJECT_ID, {
      id: BAR_POPUP_PROJECT_ID,
      sphereDefault: "wirtschaftlich",
    });

    const event = makeEvent({
      type: "expense",
      bezeichnung: "Bratwurst-Beleg",
      betragCents: "2350",
      currency: "EUR",
      kategorieNameSnapshot: "Verpflegung",
      // Valid Sphere enum member, DISTINCT from the trap's "wirtschaftlich".
      sphereSnapshot: "vermoegen",
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
      projectId: BAR_POPUP_PROJECT_ID,
      // C2-TAX: rechnungsdatum + abfluss_datum + beleg are now required.
      rechnungsdatum: "2026-05-01",
      abfluss_datum: "2026-05-02",
      beleg: mkBelegFile(),
    });

    // ACT
    const result = await runCreate(event);

    // ASSERT — redirect on success; the action forwards the picked Kategorie
    // name and the client sphere verbatim.
    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    const callArg = createExpenseMock.mock.calls[0]?.[0] as {
      kategorieNameSnapshot: string;
      sphereSnapshot?: string;
    };
    expect(callArg.kategorieNameSnapshot).toBe("Verpflegung");
    // §4.5: action forwards the client sphere verbatim — no project override.
    // projectStore is armed with sphereDefault "wirtschaftlich"; if a resurrected
    // ADR-0008 path rewrote it, this would be "wirtschaftlich", not "vermoegen".
    expect(callArg.sphereSnapshot).toBe("vermoegen");
  });

  it("income: forwards kategorieNameSnapshot + client sphere verbatim; no project override (armed trap)", async () => {
    // ARMED TRAP (see expense case): sphereDefault "wirtschaftlich" must NOT
    // rewrite the forwarded sphere under §4.5.
    projectStore.set(BAR_POPUP_PROJECT_ID, {
      id: BAR_POPUP_PROJECT_ID,
      sphereDefault: "wirtschaftlich",
    });

    const event = makeEvent({
      type: "income",
      bezeichnung: "Getränkeumsatz",
      betragCents: "5000",
      currency: "EUR",
      kategorieNameSnapshot: "Honorar",
      // Valid Sphere enum member, DISTINCT from the trap's "wirtschaftlich".
      sphereSnapshot: "vermoegen",
      projectId: BAR_POPUP_PROJECT_ID,
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createIncomeMock).toHaveBeenCalledTimes(1);
    const callArg = createIncomeMock.mock.calls[0]?.[0] as {
      kategorieNameSnapshot: string;
      sphereSnapshot?: string;
    };
    expect(callArg.kategorieNameSnapshot).toBe("Honorar");
    // §4.5: forwarded verbatim — a resurrected ADR-0008 override would make
    // this "wirtschaftlich" (the armed trap), not "vermoegen".
    expect(callArg.sphereSnapshot).toBe("vermoegen");
  });
});

// ---------------------------------------------------------------------------
// C7-1 — load() reads ?kind=… and surfaces an initialType so the form lands
// on the right tab when reached via the FAB bottom-sheet quick actions.
// ---------------------------------------------------------------------------

interface LoadEvent {
  url: URL;
  locals: { session: { user: { id: string } } | null };
}

function makeLoadEvent(search: string): LoadEvent {
  return {
    url: new URL(`http://test.local/app/transactions/neu${search}`),
    locals: { session: { user: { id: "user-test-1" } } },
  };
}

async function runLoad(event: LoadEvent): Promise<{ initialType: string }> {
  const fn = load as unknown as (e: LoadEvent) => Promise<{
    initialType: string;
  }>;
  return fn(event);
}

describe("/app/transactions/neu — load() honours ?kind= (C7-1)", () => {
  it("?kind=ausgabe → initialType='expense'", async () => {
    const data = await runLoad(makeLoadEvent("?kind=ausgabe"));
    expect(data.initialType).toBe("expense");
  });

  it("?kind=einnahme → initialType='income'", async () => {
    const data = await runLoad(makeLoadEvent("?kind=einnahme"));
    expect(data.initialType).toBe("income");
  });

  it("?kind=spende → initialType='donation'", async () => {
    const data = await runLoad(makeLoadEvent("?kind=spende"));
    expect(data.initialType).toBe("donation");
  });

  it("no ?kind=… → initialType defaults to 'expense'", async () => {
    const data = await runLoad(makeLoadEvent(""));
    expect(data.initialType).toBe("expense");
  });

  it("?kind=bogus → initialType defaults to 'expense' (silently ignored)", async () => {
    const data = await runLoad(makeLoadEvent("?kind=bogus"));
    expect(data.initialType).toBe("expense");
  });
});
