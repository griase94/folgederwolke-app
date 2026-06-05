/**
 * @vitest-environment node
 * @phase-6-spenden
 *
 * Task 5 — the /app/spenden/neu `?/create` action.
 *
 * The action reads the 3-picker FormData and calls `createSpende` (the Task-4
 * reconciled path that delegates to createDonation) — it does NOT re-derive the
 * Kategorie in the form. On `!ok` it surfaces `fail(status, …)`; on ok it
 * redirects to the new detail route. We mock `createSpende` to assert the
 * wiring + the failure mapping (the deep validation lives in the Task-4
 * integration test).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createSpendeMock = vi.fn();

vi.mock("$lib/server/domain/spenden.js", () => ({
  createSpende: createSpendeMock,
}));

const { actions } =
  await import("../../src/routes/app/spenden/neu/+page.server.js");

// `actions.create` is typed optional on the Actions record — pin a callable ref.
const create = actions.create!;

function makeEvent(fields: Record<string, string>, userId: string | null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return {
    request: { formData: async () => fd },
    locals: { session: userId ? { user: { id: userId } } : null },
  } as unknown as never;
}

async function runCreateExpectRedirect(
  event: never,
): Promise<{ status: number; location: string }> {
  try {
    await create(event);
    throw new Error("expected create to throw a redirect");
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      "location" in err
    ) {
      return {
        status: (err as { status: number }).status,
        location: (err as { location: string }).location,
      };
    }
    throw err;
  }
}

beforeEach(() => {
  createSpendeMock.mockReset();
});

describe("/app/spenden/neu ?/create", () => {
  it("passes the posted fields to createSpende with the session user id", async () => {
    createSpendeMock.mockResolvedValue({
      ok: true,
      donationId: "d-1",
      businessId: "S-2026-001",
    });
    await runCreateExpectRedirect(
      makeEvent(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: "2026-03-01",
          betragCents: "5000",
          spender_name: "Erika Externe",
          spender_adresse: "Hauptstr. 1, 10115 Berlin",
        },
        "user-1",
      ),
    );
    expect(createSpendeMock).toHaveBeenCalledTimes(1);
    const [raw, userId] = createSpendeMock.mock.calls[0]!;
    expect((raw as Record<string, string>).spende_kind).toBe("geldspende");
    expect((raw as Record<string, string>).betragCents).toBe("5000");
    expect(userId).toBe("user-1");
  });

  it("redirects 303 to the new detail route on success", async () => {
    createSpendeMock.mockResolvedValue({
      ok: true,
      donationId: "d-42",
      businessId: "S-2026-042",
    });
    const r = await runCreateExpectRedirect(
      makeEvent({ spende_kind: "geldspende" }, "user-1"),
    );
    expect(r.status).toBe(303);
    expect(r.location).toBe("/app/spenden/d-42");
  });

  it("returns fail(422) when createSpende rejects a zweckgebunden post without text", async () => {
    createSpendeMock.mockResolvedValue({
      ok: false,
      status: 422,
      errors: { zweckbindung_text: ["Zweck muss benannt sein"] },
      values: {},
    });
    const result = (await create(
      makeEvent(
        { spende_kind: "geldspende", zweckbindung_kind: "zweckgebunden" },
        "user-1",
      ),
    )) as { status: number; data: { errors: Record<string, string[]> } };
    expect(result.status).toBe(422);
    expect(result.data.errors).toHaveProperty("zweckbindung_text");
  });

  it("returns fail(422) when createSpende rejects a Sachspende without Wertermittlung", async () => {
    createSpendeMock.mockResolvedValue({
      ok: false,
      status: 422,
      errors: {
        wertermittlung_methode: ["Wertermittlungsmethode ist Pflichtfeld"],
        zustand_beschreibung: ["Beschreibung des Gegenstands ist Pflichtfeld"],
      },
      values: {},
    });
    const result = (await create(
      makeEvent({ spende_kind: "sachspende" }, "user-1"),
    )) as { status: number; data: { errors: Record<string, string[]> } };
    expect(result.status).toBe(422);
    expect(result.data.errors).toHaveProperty("wertermittlung_methode");
    expect(result.data.errors).toHaveProperty("zustand_beschreibung");
  });

  it("passes a null user id when unauthenticated", async () => {
    createSpendeMock.mockResolvedValue({
      ok: true,
      donationId: "d-9",
      businessId: "S-2026-009",
    });
    await runCreateExpectRedirect(
      makeEvent({ spende_kind: "geldspende" }, null),
    );
    const [, userId] = createSpendeMock.mock.calls[0]!;
    expect(userId).toBeNull();
  });
});
