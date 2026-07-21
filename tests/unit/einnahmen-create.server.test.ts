/**
 * @vitest-environment node
 * @phase-5-einnahmen
 *
 * Phase 5 / Task 3 — the Einnahmen entry-form `?/create` action (Tier C2).
 *
 * The simplest of the three create paths: a freie Einnahme → `createIncome`.
 *   - NO bezahlt-von branching, NO auto-pay, NO member-mail.
 *   - Beleg is OPTIONAL (contrast Ausgaben's beleg-or-Begründung): a submission
 *     WITH a Beleg persists its `belegFileId`; a submission WITHOUT one succeeds
 *     (NO Begründung required).
 *   - Sphere is derived server-side INSIDE `createIncome` (spec §4.5, no project
 *     override) — the action forwards `kategorieId` (#115) and lets the
 *     domain layer resolve kategorie + sphere.
 *   - festschreibung-gated: a gate failure → `fail(gate.status)`, createIncome
 *     NOT called.
 *
 * Strategy mirrors the pattern from the (now retired) transactions/neu test: mock
 * every dependency the action touches (createIncome + id-allocator + gate +
 * the Beleg upload helper) and drive the handler with a synthesized FormData.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const createIncomeMock = vi.fn(async (_input: unknown) => ({
  id: "inc-new-1",
  businessId: "E-2026-001",
}));
type GateResult = { ok: true } | { ok: false; status: number; error: string };
const checkFestschreibungGateMock = vi.fn(
  async (_year: number): Promise<GateResult> => ({ ok: true }),
);
vi.mock("$lib/server/domain/transactions.js", () => ({
  createIncome: createIncomeMock,
  checkFestschreibungGate: checkFestschreibungGateMock,
}));

const allocateBusinessIdMock = vi.fn(
  async (kind: string, year: number) => `${kind}-${year}-001`,
);
vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: allocateBusinessIdMock,
}));

// Beleg upload helper — returns a deterministic fileId so the createIncome
// mock can assert it persisted when a Beleg is provided.
const handleAuslageUploadMock = vi.fn(async () => ({
  fileId: "file-einnahme-1",
  dedupHit: false,
  sniffedMimeType: "application/pdf",
  sanitizedFilename: "beleg.pdf",
}));
vi.mock("$lib/server/files/handleAuslageUpload.js", () => ({
  handleAuslageUpload: handleAuslageUploadMock,
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { actions } =
  await import("../../src/routes/app/einnahmen/neu/+page.server.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ActionEvent {
  request: Request;
  locals: { session: { user: { id: string } } | null };
}

function makeEvent(
  formFields: Record<string, string | File>,
  user: { id: string } | null = { id: "user-test-1" },
): ActionEvent {
  const fd = new FormData();
  for (const [k, v] of Object.entries(formFields)) fd.set(k, v);
  const request = new Request("http://test.local/app/einnahmen/neu", {
    method: "POST",
    body: fd,
  });
  return {
    request,
    locals: { session: user ? { user } : null },
  } as ActionEvent;
}

function mkBelegFile(): File {
  const buf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n",
    "utf-8",
  );
  return new File([buf], "beleg.pdf", { type: "application/pdf" });
}

async function runCreate(event: ActionEvent): Promise<{
  redirect?: { status: number; location: string };
  fail?: { status: number; data: unknown };
}> {
  try {
    const result = await (
      actions.create as (e: ActionEvent) => Promise<unknown>
    )(event);
    // fail() returns an ActionFailure { status, data } object (not thrown).
    return { fail: result as { status: number; data: unknown } };
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

const VALID = {
  bezeichnung: "Mitgliedsbeitrag Max",
  betragCents: "5000",
  geldEingangDatum: "2026-05-01",
  // #115: the picker submits a valid Kategorie uuid (the schema uuid-validates).
  kategorieId: "66666666-6666-4666-8666-666666666666",
};

beforeEach(() => {
  createIncomeMock.mockClear();
  createIncomeMock.mockResolvedValue({
    id: "inc-new-1",
    businessId: "E-2026-001",
  });
  checkFestschreibungGateMock.mockClear();
  checkFestschreibungGateMock.mockResolvedValue({ ok: true as const });
  allocateBusinessIdMock.mockClear();
  handleAuslageUploadMock.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/app/einnahmen/neu — create action (freie Einnahme → createIncome)", () => {
  it("creates a freie Einnahme via createIncome (E-prefixed id), then redirects 303", async () => {
    const result = await runCreate(makeEvent(VALID));

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(createIncomeMock).toHaveBeenCalledTimes(1);

    const arg = createIncomeMock.mock.calls[0]![0] as {
      bezeichnung: string;
      betragCents: number;
      kategorieId: string;
      geldEingangDatum?: string | null;
      businessId: string;
      actorUserId: string;
    };
    expect(arg.bezeichnung).toBe(VALID.bezeichnung);
    expect(arg.betragCents).toBe(5000);
    // #115: the action forwards the picked kategorie ID; createIncome resolves
    // it + derives the name + sphere from the row.
    expect(arg.kategorieId).toBe(VALID.kategorieId);
    expect(arg.geldEingangDatum).toBe(VALID.geldEingangDatum);
    expect(arg.actorUserId).toBe("user-test-1");

    // E-prefixed businessId from allocateBusinessId("E", year).
    expect(allocateBusinessIdMock).toHaveBeenCalledTimes(1);
    expect(allocateBusinessIdMock.mock.calls[0]![0]).toBe("E");
    expect(arg.businessId).toMatch(/^E-\d{4}-\d{3}$/);

    // Redirects to the new income's detail.
    expect(result.redirect?.location).toBe("/app/einnahmen/inc-new-1");
  });

  it("persists a provided Beleg's belegFileId (Beleg optional but saved when present)", async () => {
    const result = await runCreate(
      makeEvent({ ...VALID, beleg: mkBelegFile() }),
    );

    expect(result.redirect?.status).toBe(303);
    expect(handleAuslageUploadMock).toHaveBeenCalledTimes(1);
    const arg = createIncomeMock.mock.calls[0]![0] as { belegFileId?: string };
    expect(arg.belegFileId).toBe("file-einnahme-1");
  });

  it("succeeds with NO Beleg (Beleg is optional; NO Begründung required)", async () => {
    const result = await runCreate(makeEvent(VALID)); // no beleg field

    expect(result.fail).toBeUndefined();
    expect(result.redirect?.status).toBe(303);
    expect(handleAuslageUploadMock).not.toHaveBeenCalled();
    expect(createIncomeMock).toHaveBeenCalledTimes(1);
    const arg = createIncomeMock.mock.calls[0]![0] as { belegFileId?: unknown };
    // No Beleg → belegFileId is null/undefined; the create still goes through.
    expect(arg.belegFileId ?? null).toBeNull();
  });

  it("never branches on bezahlt-von and never auto-pays", async () => {
    // Pass a stray bezahltVonKind — the Einnahmen schema must NOT honor it,
    // and createIncome must be called with NO bezahltVon* fields.
    await runCreate(makeEvent({ ...VALID, bezahltVonKind: "member" }));
    expect(createIncomeMock).toHaveBeenCalledTimes(1);
    const arg = createIncomeMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.bezahltVonKind).toBeUndefined();
    expect(arg.bezahltVonMemberId).toBeUndefined();
    expect(arg.bezahltVonDisplay).toBeUndefined();
    // No mark-paid / auto-pay side-effect exists on this path: the only domain
    // call is createIncome (the mock set is the full surface the action touches).
  });

  it("respects the festschreibung gate (gate fail → fail(status), createIncome NOT called)", async () => {
    checkFestschreibungGateMock.mockResolvedValue({
      ok: false as const,
      status: 409,
      error: "Jahr 2026 ist festgeschrieben",
    });

    const result = await runCreate(makeEvent(VALID));

    expect(result.redirect).toBeUndefined();
    expect(result.fail?.status).toBe(409);
    expect(createIncomeMock).not.toHaveBeenCalled();
  });

  it("rejects when not authenticated (401, createIncome NOT called)", async () => {
    const result = await runCreate(makeEvent(VALID, null));
    expect(result.fail?.status).toBe(401);
    expect(createIncomeMock).not.toHaveBeenCalled();
  });
});
