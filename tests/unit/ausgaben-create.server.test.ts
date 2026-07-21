/**
 * @vitest-environment node
 * @phase-4-ausgaben
 *
 * Unit tests for the Ausgabe entry action `/app/ausgaben/neu/+page.server.ts`
 * `?/create` — Phase 4 (Tier C1), Task 4. The bezahlt-von branching is the
 * trickiest tab logic, so it gets full TDD here.
 *
 * Review-amendment payment matrix:
 *   (a) bezahltVonKind=verein
 *         → createExpense (status geprueft, approvedAt now) THEN
 *           markExpenseAsPaid(id, { datum, zahlartId, actorUserId })  — POSITIONAL,
 *           no member mail (emits expense.updated, audit only).
 *   (b) bezahltVonKind=member (default, no schonBezahlt)
 *         → createExpense only (Auslagenflow: stays geprueft/awaiting Erstattung);
 *           markExpenseAsPaid NOT called.
 *   (c) bezahltVonKind=member + schonBezahlt (admin)
 *         → createExpense THEN markExpenseErstattet({ expenseId, chosenDate,
 *           zahlungsartId, actorUserId }) — fires the SEPA-payout confirmation
 *           mail; markExpenseAsPaid NOT called (this is the mailing path).
 *
 * Validation: an Ausgabe satisfies the beleg-or-Begründung rule by EITHER a
 * Beleg file OR a "kein Beleg" + Begründung; neither → fail(422).
 *
 * Sphere is DERIVED inside createExpense (spec §4.5, no project override) — the
 * action only forwards the picked kategorieNameSnapshot.
 *
 * Everything is mocked (mirrors the old transactions/neu page.server.test.ts);
 * no real DB. We assert on the args the create/mark mocks captured.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const createExpenseMock = vi.fn(async (_input: unknown) => ({
  id: "exp-new-1",
  businessId: "A-2026-001",
}));
// Typed on the real result union so `.mockResolvedValueOnce` can return the
// !ok branch (Fix 5a — verify the create action propagates a mark failure).
type MarkPaidResult = { ok: true } | { ok: false; error: string };
const markExpenseAsPaidMock = vi.fn(
  async (_id: string, _params: unknown): Promise<MarkPaidResult> => ({
    ok: true,
  }),
);

vi.mock("$lib/server/domain/transactions.js", () => ({
  createExpense: createExpenseMock,
  markExpenseAsPaid: markExpenseAsPaidMock,
  checkFestschreibungGate: async () => ({ ok: true as const }),
  listZahlungsarten: async () => [
    { id: "za-bank", kind: "bank", label: "Banküberweisung" },
  ],
}));

type ErstattetResult =
  | { ok: true; alreadyErstattet: boolean }
  | { ok: false; status: number; error: string };
const markExpenseErstattetMock = vi.fn(
  async (_input: unknown): Promise<ErstattetResult> => ({
    ok: true,
    alreadyErstattet: false,
  }),
);
vi.mock("$lib/server/domain/audit-inbox-actions.js", () => ({
  markExpenseErstattet: markExpenseErstattetMock,
}));

vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: async (kind: string, year: number) =>
    `${kind}-${year}-001`,
}));

vi.mock("$lib/server/domain/transaction-pickers.js", () => ({
  listKategorieOptions: async (kind: "expense") => [
    {
      id: "kat-verpflegung",
      kind,
      name: "Verpflegung",
      sphere: "ideeller",
      sortOrder: 0,
      deactivated: false,
    },
  ],
  loadRecentKategorieUsage: async () => [],
  pickDefaultKategorieName: () => "Verpflegung",
  listMemberOptions: async () => [
    { id: "11111111-1111-4111-8111-111111111111", label: "Felix Muster" },
  ],
}));

// Beleg upload helper — returns a deterministic fileId (Verein/member-with-file
// path). The neither-Beleg-nor-Begründung test never reaches it.
const handleAuslageUploadMock = vi.fn(async () => ({
  fileId: "file-test-1",
  dedupHit: false,
  sniffedMimeType: "application/pdf",
  sanitizedFilename: "beleg.pdf",
}));
vi.mock("$lib/server/files/handleAuslageUpload.js", () => ({
  handleAuslageUpload: handleAuslageUploadMock,
}));

// Members/projects lookups in load() — stub the DB so the action stays
// DB-free. load() is not under test here; the action reads no DB directly.
function makeDbFake() {
  const chain = {
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    then(resolve: (rows: unknown[]) => unknown) {
      return Promise.resolve([]).then(resolve);
    },
  };
  return { select: () => chain };
}
vi.mock("$lib/server/db/index.js", () => ({ getDb: () => makeDbFake() }));
vi.mock("$lib/server/db/schema/members.js", () => ({ members: {} }));
vi.mock("$lib/server/db/schema/projects.js", () => ({ projects: {} }));
// The /neu load renders the real list as an inert Kulisse backdrop via the
// shared loader (B-Kulisse). These prefill/create tests don't exercise the
// backdrop, so stub the loader — it isolates the load's list-query DB work.
vi.mock("../../src/routes/app/ausgaben/list-load.js", () => ({
  loadAusgabenListData: vi.fn(async () => ({
    tab: "ausgaben",
    rows: [],
    total: 0,
    page: 1,
    pageSize: 50,
    filterState: { enums: {}, members: {}, amount: {}, booleans: {} },
    yearScope: 2026,
    currentYear: 2026,
    kpi: {},
    kategorieOptions: [],
    memberOptions: [],
  })),
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { actions, load } =
  await import("../../src/routes/app/ausgaben/neu/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } | null };
}

function makeEvent(
  fields: Record<string, string | File>,
  user: { id: string } | null = { id: "user-1" },
): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: new Request("http://test.local/app/ausgaben/neu", {
      method: "POST",
      body: fd,
    }),
    locals: { session: user ? { user } : null },
  };
}

function mkBelegFile(): File {
  const buf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF\n",
    "utf-8",
  );
  return new File([buf], "beleg.pdf", { type: "application/pdf" });
}

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

const VEREIN_BASE = {
  bezeichnung: "Raummiete März",
  betragCents: "45000",
  kategorieNameSnapshot: "Verpflegung",
  sphereSnapshot: "ideeller",
  rechnungsdatum: "2026-03-01",
  abfluss_datum: "2026-03-02",
};

const ZAHLART_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  createExpenseMock.mockClear();
  markExpenseAsPaidMock.mockClear();
  markExpenseErstattetMock.mockClear();
  handleAuslageUploadMock.mockClear();
});

// ---------------------------------------------------------------------------
// (a) Verein → creates then marks paid (erstattet), no member notify
// ---------------------------------------------------------------------------

describe("ausgaben/neu ?/create — Verein auto-paid", () => {
  it("Verein → creates then markExpenseAsPaid(id, { datum, zahlartId, actorUserId }); no mail", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      beleg: mkBelegFile(),
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(result.redirect?.location).toBe("/app/ausgaben/exp-new-1");

    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    const createArg = createExpenseMock.mock.calls[0]![0] as {
      kategorieNameSnapshot: string;
      bezahltVonKind: string;
    };
    expect(createArg.kategorieNameSnapshot).toBe("Verpflegung");
    expect(createArg.bezahltVonKind).toBe("verein");

    // markExpenseAsPaid is POSITIONAL: (id, params). No mail; member notify path
    // (markExpenseErstattet) must NOT fire for Verein.
    expect(markExpenseAsPaidMock).toHaveBeenCalledTimes(1);
    const [paidId, paidParams] = markExpenseAsPaidMock.mock.calls[0]! as [
      string,
      { datum: string; zahlartId: string | null; actorUserId: string },
    ];
    expect(paidId).toBe("exp-new-1");
    expect(paidParams.datum).toBe("2026-03-02"); // the Abfluss date
    expect(paidParams.zahlartId).toBe(ZAHLART_ID);
    expect(paidParams.actorUserId).toBe("user-1");
    expect(markExpenseErstattetMock).not.toHaveBeenCalled();
  });

  it("propagates a markExpenseAsPaid failure → fail(409), no redirect (Fix 5a)", async () => {
    markExpenseAsPaidMock.mockResolvedValueOnce({
      ok: false,
      error: "Auslage ist festgeschrieben — Bezahlt-Markierung verweigert",
    });
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      beleg: mkBelegFile(),
    });

    const result = (await runCreate(event)) as {
      redirect?: { status: number };
      fail?: { status?: number; data?: { error?: string } };
    };
    // The mark failed → the action surfaces it, does NOT redirect to the detail.
    expect(result.redirect).toBeUndefined();
    expect(result.fail?.status).toBe(409);
    expect(result.fail?.data?.error).toContain("festgeschrieben");
  });
});

// ---------------------------------------------------------------------------
// (b) Mitglied default → geprueft, no auto-pay
// ---------------------------------------------------------------------------

describe("ausgaben/neu ?/create — Mitglied (Auslagenflow)", () => {
  it("Mitglied default → createExpense only; markExpenseAsPaid NOT called, no mail", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "member",
      bezahltVonMemberId: MEMBER_ID,
      bezahltVonDisplay: "Felix Muster",
      beleg: mkBelegFile(),
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    expect(markExpenseAsPaidMock).not.toHaveBeenCalled();
    expect(markExpenseErstattetMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) Mitglied + schonBezahlt → marks erstattet (SEPA-payout confirmation mail)
// ---------------------------------------------------------------------------

describe("ausgaben/neu ?/create — Mitglied + Schon bezahlt", () => {
  it("Mitglied + schonBezahlt → markExpenseErstattet({ expenseId, chosenDate, zahlungsartId, actorUserId }); markExpenseAsPaid NOT called", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "member",
      bezahltVonMemberId: MEMBER_ID,
      bezahltVonDisplay: "Felix Muster",
      schonBezahlt: "true",
      zahlungsartId: ZAHLART_ID,
      erstattetAm: "2026-03-05",
      beleg: mkBelegFile(),
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createExpenseMock).toHaveBeenCalledTimes(1);

    expect(markExpenseErstattetMock).toHaveBeenCalledTimes(1);
    const erstattetArg = markExpenseErstattetMock.mock.calls[0]![0] as {
      expenseId: string;
      chosenDate: string;
      zahlungsartId: string;
      actorUserId: string;
    };
    expect(erstattetArg.expenseId).toBe("exp-new-1");
    expect(erstattetArg.chosenDate).toBe("2026-03-05");
    expect(erstattetArg.zahlungsartId).toBe(ZAHLART_ID);
    expect(erstattetArg.actorUserId).toBe("user-1");

    // This is the mailing path — markExpenseAsPaid (the no-mail path) must NOT fire.
    expect(markExpenseAsPaidMock).not.toHaveBeenCalled();
  });

  it("Mitglied + schonBezahlt + NO zahlungsartId → fail(422); markExpenseErstattet NOT called (Fix 5b)", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "member",
      bezahltVonMemberId: MEMBER_ID,
      bezahltVonDisplay: "Felix Muster",
      schonBezahlt: "true",
      erstattetAm: "2026-03-05",
      // zahlungsartId intentionally omitted — markExpenseErstattet requires it.
      beleg: mkBelegFile(),
    });

    const result = (await runCreate(event)) as {
      redirect?: { status: number };
      fail?: { status?: number; data?: { error?: string } };
    };
    expect(result.fail?.status).toBe(422);
    expect(result.fail?.data?.error).toContain("Zahlungsart");
    // The mailing helper must NOT be invoked without a Zahlungsart.
    expect(markExpenseErstattetMock).not.toHaveBeenCalled();
    expect(result.redirect).toBeUndefined();
  });

  it("propagates a markExpenseErstattet failure → fail(status), no redirect (Fix 5a)", async () => {
    markExpenseErstattetMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: "Jahr 2025 ist festgeschrieben",
    });
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "member",
      bezahltVonMemberId: MEMBER_ID,
      bezahltVonDisplay: "Felix Muster",
      schonBezahlt: "true",
      zahlungsartId: ZAHLART_ID,
      erstattetAm: "2026-03-05",
      beleg: mkBelegFile(),
    });

    const result = (await runCreate(event)) as {
      redirect?: { status: number };
      fail?: { status?: number; data?: { error?: string } };
    };
    expect(markExpenseErstattetMock).toHaveBeenCalledTimes(1);
    expect(result.redirect).toBeUndefined();
    expect(result.fail?.status).toBe(409);
    expect(result.fail?.data?.error).toContain("festgeschrieben");
  });
});

// ---------------------------------------------------------------------------
// beleg-or-Begründung validation
// ---------------------------------------------------------------------------

describe("ausgaben/neu ?/create — beleg-or-Begründung", () => {
  it("accepts kein-Beleg + Begründung (no file) → createExpense with belegVerzichtGrund", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      keinBeleg: "true",
      begruendung: "Beleg ging beim Bäcker verloren — Quittung nicht erhalten.",
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    const createArg = createExpenseMock.mock.calls[0]![0] as {
      belegFileId?: string | null;
      belegVerzichtGrund?: string | null;
    };
    expect(createArg.belegVerzichtGrund).toContain("Beleg ging");
    expect(createArg.belegFileId ?? null).toBeNull();
    expect(handleAuslageUploadMock).not.toHaveBeenCalled();
  });

  it("rejects: neither Beleg nor Begründung → fail(422)", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      // no beleg file, no keinBeleg/Begründung
    });

    const result = (await runCreate(event)) as {
      fail?: { status?: number };
    };
    expect(result.fail?.status).toBe(422);
    expect(createExpenseMock).not.toHaveBeenCalled();
  });

  it("rejects: kein-Beleg ticked but Begründung empty → fail(422)", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      keinBeleg: "true",
      begruendung: "",
    });

    const result = (await runCreate(event)) as { fail?: { status?: number } };
    expect(result.fail?.status).toBe(422);
    expect(createExpenseMock).not.toHaveBeenCalled();
  });

  it("rejects when not signed in → fail(401)", async () => {
    const event = makeEvent(
      { ...VEREIN_BASE, bezahltVonKind: "verein", beleg: mkBelegFile() },
      null,
    );
    const result = (await runCreate(event)) as { fail?: { status?: number } };
    expect(result.fail?.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// (e) Extern payer — the „unsichtbare Wand" regression guard.
//
// The client derives a hidden `bezahltVonDisplay` and for an extern payer used
// to leave it "" → the action maps ""→null → the schema `.default("(unbekannt)")`
// (which fires ONLY on `undefined`) rejected the null with a generic
// invalid_type wall, so createExpense NEVER ran and the German IBAN check was
// unreachable. These pin: (1) an empty display no longer wedges the parse, and
// (2) the specific "IBAN ist ungültig." now actually surfaces.
// ---------------------------------------------------------------------------

const VALID_DE_IBAN = "DE89370400440532013000";

describe("ausgaben/neu ?/create — Extern payer (empty-display regression)", () => {
  it("extern + valid name + valid IBAN + EMPTY bezahltVonDisplay → creates (no invisible wall)", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "extern",
      // Exactly what the buggy client posted for an extern payer: an empty
      // hidden. Must NOT kill the parse — the backstop coerces it.
      bezahltVonDisplay: "",
      externName: "Erika Extern",
      externIban: VALID_DE_IBAN,
      keinBeleg: "true",
      begruendung: "Extern-Erstattung, kein Beleg vorhanden.",
    });

    const result = await runCreate(event);

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createExpenseMock).toHaveBeenCalledTimes(1);
    const createArg = createExpenseMock.mock.calls[0]![0] as {
      bezahltVonKind?: string;
      externName?: string | null;
      externIban?: string | null;
    };
    expect(createArg.bezahltVonKind).toBe("extern");
    expect(createArg.externName).toBe("Erika Extern");
    expect(createArg.externIban).toBe(VALID_DE_IBAN);
  });

  it('extern + malformed IBAN + EMPTY bezahltVonDisplay → the SPECIFIC „IBAN ist ungültig." (not the generic wall)', async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezahltVonKind: "extern",
      bezahltVonDisplay: "",
      externName: "Erika Extern",
      externIban: "DE00 QUATSCH",
      keinBeleg: "true",
      begruendung: "Extern-Erstattung, kein Beleg vorhanden.",
    });

    const result = (await runCreate(event)) as {
      fail?: {
        status?: number;
        data?: { error?: string; errors?: Record<string, string[]> };
      };
    };
    expect(result.fail?.status).toBe(422);
    // The extern guard ran and returned its specific message — NOT the generic
    // „Ungültige Eingabe" Zod wall that a dead parse would have produced.
    expect(result.fail?.data?.error).toBe("IBAN ist ungültig.");
    expect(result.fail?.data?.errors?.extern_iban).toBeTruthy();
    expect(createExpenseMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// load — duplicate-as-template prefill (Fix 1)
// ---------------------------------------------------------------------------

interface LoadEvent {
  locals: { session: { user: { id: string } } | null };
  url: URL;
  parent: () => Promise<{ yearScope: number; currentYear: number }>;
}

function makeLoadEvent(search: string): LoadEvent {
  return {
    locals: { session: { user: { id: "user-1" } } },
    url: new URL(`http://test.local/app/ausgaben/neu${search}`),
    // The /neu load reads yearScope from the app layout (parent) for the Kulisse
    // backdrop; the prefill under test is independent of it.
    parent: async () => ({ yearScope: 2026, currentYear: 2026 }),
  };
}

async function runLoad(event: LoadEvent): Promise<Record<string, unknown>> {
  return (await (load as (e: LoadEvent) => Promise<Record<string, unknown>>)(
    event,
  )) as Record<string, unknown>;
}

describe("ausgaben/neu load — duplicate prefill", () => {
  it("parses the duplicate query params into a values object (betragCents → euros)", async () => {
    const data = await runLoad(
      makeLoadEvent(
        "?bezeichnung=Raummiete+M%C3%A4rz&betragCents=45000&kategorieNameSnapshot=Miete&kommentar=monatlich&bezahltVonKind=member&bezahltVonMemberId=11111111-1111-4111-8111-111111111111",
      ),
    );
    const values = data.values as Record<string, unknown>;
    expect(values).toBeTruthy();
    expect(values.bezeichnung).toBe("Raummiete März");
    // betragCents is surfaced as a de-DE euros string for the hero display input.
    expect(values.betrag).toBe("450,00");
    expect(values.kategorieNameSnapshot).toBe("Miete");
    expect(values.kommentar).toBe("monatlich");
    expect(values.bezahltVonKind).toBe("member");
    expect(values.bezahltVonMemberId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("returns empty values (no prefill) for a fresh /neu visit", async () => {
    const data = await runLoad(makeLoadEvent(""));
    const values = data.values as Record<string, unknown>;
    expect(values.bezeichnung ?? "").toBe("");
    expect(values.betrag ?? "").toBe("");
  });
});

// ---------------------------------------------------------------------------
// ?/create — 422 re-hydration (Fix 2)
// ---------------------------------------------------------------------------

describe("ausgaben/neu ?/create — 422 re-hydrates the form", () => {
  it("returns the submitted values + per-field errors on a Beleg-gate 422 (no input wiped)", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezeichnung: "Teilausgefüllt",
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Folge der Wolke e.V.",
      zahlungsartId: ZAHLART_ID,
      // no beleg → triggers the §4.1 gate 422
    });
    const result = (await runCreate(event)) as {
      fail?: {
        status?: number;
        data?: {
          values?: Record<string, unknown>;
          errors?: Record<string, string[]>;
        };
      };
    };
    expect(result.fail?.status).toBe(422);
    // The submitted values come back so the form re-hydrates instead of wiping.
    expect(result.fail?.data?.values?.bezeichnung).toBe("Teilausgefüllt");
    expect(result.fail?.data?.values?.kategorieNameSnapshot).toBe(
      "Verpflegung",
    );
    // A per-field error is surfaced for the Beleg gate.
    expect(result.fail?.data?.errors?.beleg).toBeTruthy();
  });

  it("returns values + a kategorie field error on a schema 422", async () => {
    const event = makeEvent({
      ...VEREIN_BASE,
      bezeichnung: "Ohne Kategorie",
      kategorieNameSnapshot: "(Unkategorisiert)",
      bezahltVonKind: "verein",
      beleg: mkBelegFile(),
    });
    const result = (await runCreate(event)) as {
      fail?: {
        status?: number;
        data?: {
          values?: Record<string, unknown>;
          errors?: Record<string, string[]>;
        };
      };
    };
    expect(result.fail?.status).toBe(422);
    expect(result.fail?.data?.values?.bezeichnung).toBe("Ohne Kategorie");
    expect(result.fail?.data?.errors?.kategorieNameSnapshot).toBeTruthy();
  });
});
