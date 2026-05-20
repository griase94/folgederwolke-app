/**
 * @vitest-environment node
 * @phase-5
 *
 * Unit tests for the /app/transactions/neu `create` action — cluster C4.
 *
 * Cycle-2 finding (PR #45 B1): the action handler re-resolves the sphere
 * server-side from the picked Kategorie (good, fixes the original tampering
 * hole), but it hardcoded `projectSphereOverride: null` at both call sites
 * (expense + income). That silently broke ADR-0008 — a project with a
 * `sphereDefault` was supposed to override the Kategorie's default sphere,
 * and the canonical pattern lives in invoices.ts:234-243.
 *
 * Bar-Pop-up motivating example: a "Verpflegung" expense (Kategorie default
 * sphere = ideeller) booked on the Bar-Pop-up project (sphereDefault =
 * wirtschaftlich) MUST land in sphere=wirtschaftlich, otherwise the EÜR
 * splits the wirtschaftlich Geschäftsbetrieb incorrectly.
 *
 * Strategy: mock every dependency the action touches so we can drive the
 * handler with a synthesized FormData + locals.session, then assert on the
 * `sphereSnapshot` arg captured by the createExpense / createIncome mocks.
 * We don't need a real DB here — the picker logic (resolveSphereForKategorie)
 * is pure, and the action's job is to feed it the right inputs.
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
const createIncomeMock = vi.fn(async (_input: { sphereSnapshot: string }) => ({
  id: "inc-new-1",
  businessId: "E-2026-001",
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
  // resolveSphereForKategorie is pure — use the real implementation.
  // listKategorieOptions hits the DB, so stub it with a known fixture so the
  // action's "re-derive sphere from picked Kategorie" path is exercised.
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

const { actions } = await import("./+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } };
}

function makeEvent(formFields: Record<string, string>): ActionEvent {
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

describe("/app/transactions/neu — create action honors ADR-0008", () => {
  it("expense: project.sphereDefault overrides the Kategorie's default sphere", async () => {
    // ARRANGE — Verpflegung Kategorie defaults to ideeller; Bar-Pop-up
    // Projekt forces wirtschaftlich. ADR-0008 says project override wins.
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
      sphereSnapshot: "ideeller", // tampered/stale client value — server must ignore
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
      projectId: BAR_POPUP_PROJECT_ID,
    });

    // ACT
    const result = await runCreate(event);

    // ASSERT — redirect on success, and the booking landed in wirtschaftlich.
    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    const callArg = createExpenseMock.mock.calls[0]?.[0] as {
      sphereSnapshot: string;
    };
    expect(callArg.sphereSnapshot).toBe("wirtschaftlich");
  });

  it("expense: no project → falls back to the Kategorie's default sphere", async () => {
    // Sanity check that the override is conditional, not unconditional.
    const event = makeEvent({
      type: "expense",
      bezeichnung: "Bürobedarf",
      betragCents: "1000",
      currency: "EUR",
      kategorieNameSnapshot: "Verpflegung",
      sphereSnapshot: "ideeller",
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    const callArg = createExpenseMock.mock.calls[0]?.[0] as {
      sphereSnapshot: string;
    };
    expect(callArg.sphereSnapshot).toBe("ideeller");
  });

  it("income: project.sphereDefault overrides the Kategorie's default sphere", async () => {
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
      sphereSnapshot: "ideeller",
      projectId: BAR_POPUP_PROJECT_ID,
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createIncomeMock).toHaveBeenCalledTimes(1);
    const callArg = createIncomeMock.mock.calls[0]?.[0] as {
      sphereSnapshot: string;
    };
    expect(callArg.sphereSnapshot).toBe("wirtschaftlich");
  });
});
