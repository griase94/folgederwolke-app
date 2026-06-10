/**
 * @vitest-environment node
 *
 * FIX-1 regression: /app/spenden/neu `?/create` must call checkFestschreibungGate
 * before any side-effect and return fail(status) on a closed year.
 *
 * A separate test file from spenden-create.server.test.ts because the gate
 * requires mocking $lib/server/domain/transactions.js in addition to spenden.js,
 * and vi.mock() hoisting makes it tricky to compose with the existing mock setup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.mock — declared before the SUT import
// ---------------------------------------------------------------------------

const createSpendeMock = vi.fn();
vi.mock("$lib/server/domain/spenden.js", () => ({
  createSpende: createSpendeMock,
}));

type GateResult = { ok: true } | { ok: false; status: number; error: string };
const checkFestschreibungGateMock = vi.fn(
  async (_year: number): Promise<GateResult> => ({ ok: true }),
);
vi.mock("$lib/server/domain/transactions.js", () => ({
  checkFestschreibungGate: checkFestschreibungGateMock,
}));

// ---------------------------------------------------------------------------
// SUT — imported AFTER the mocks
// ---------------------------------------------------------------------------

const { actions } =
  await import("../../src/routes/app/spenden/neu/+page.server.js");

const create = actions.create!;

function makeEvent(fields: Record<string, string>, userId: string | null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: { formData: async () => fd },
    locals: { session: userId ? { user: { id: userId } } : null },
  } as unknown as never;
}

const VALID_FIELDS = {
  spende_kind: "geldspende",
  zweckbindung_kind: "zweckfrei",
  zugewendet_am: "2026-03-01",
  betragCents: "5000",
  spender_name: "Erika Externe",
  spender_adresse: "Hauptstr. 1, 10115 Berlin",
};

beforeEach(() => {
  createSpendeMock.mockReset();
  checkFestschreibungGateMock.mockReset();
  checkFestschreibungGateMock.mockResolvedValue({ ok: true as const });
  createSpendeMock.mockResolvedValue({
    ok: true,
    donationId: "d-gate-1",
    businessId: "S-2026-001",
  });
});

describe("/app/spenden/neu ?/create — FIX-1 festschreibung gate", () => {
  it("calls checkFestschreibungGate before createSpende", async () => {
    try {
      await create(makeEvent(VALID_FIELDS, "user-1"));
    } catch {
      // redirect throw — expected on success
    }
    expect(checkFestschreibungGateMock).toHaveBeenCalledTimes(1);
    expect(createSpendeMock).toHaveBeenCalledTimes(1);
  });

  it("returns fail(409) when year is festgeschrieben and does NOT call createSpende", async () => {
    checkFestschreibungGateMock.mockResolvedValue({
      ok: false as const,
      status: 409,
      error: "Jahr 2026 ist festgeschrieben",
    });

    const result = (await create(makeEvent(VALID_FIELDS, "user-1"))) as {
      status: number;
      data: { error: string };
    };

    expect(result.status).toBe(409);
    expect(result.data.error).toMatch(/festgeschrieben/i);
    expect(createSpendeMock).not.toHaveBeenCalled();
  });

  it("returns fail(gate.status) for any non-ok gate result, createSpende NOT called", async () => {
    checkFestschreibungGateMock.mockResolvedValue({
      ok: false as const,
      status: 403,
      error: "Keine Berechtigung",
    });

    const result = (await create(makeEvent(VALID_FIELDS, "user-1"))) as {
      status: number;
    };

    expect(result.status).toBe(403);
    expect(createSpendeMock).not.toHaveBeenCalled();
  });
});
