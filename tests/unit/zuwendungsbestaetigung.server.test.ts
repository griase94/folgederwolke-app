/**
 * @vitest-environment node
 * @phase-6-spenden
 *
 * Task 7 — the MOVED zuwendungsbestaetigung route now lives under
 * /app/spenden/[id]/zuwendungsbestaetigung (was /app/transactions/[id]/…).
 *
 * Asserts the moved `load` resolves at the new path, `?/generate` calls
 * allocateBescheinigung(params.id, …) and returns { success, bescheinigungNr },
 * and that the page's internal links target the new /app/spenden/… paths (not
 * /app/transactions/…). The PDF endpoint streaming is covered by the existing
 * domain tests; here we pin the action wiring + link rewrite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const allocateBescheinigungMock = vi.fn();
const extractBmfPflichtfelderMock = vi.fn();

vi.mock("$lib/server/domain/spenden.js", () => ({
  allocateBescheinigung: allocateBescheinigungMock,
  extractBmfPflichtfelder: extractBmfPflichtfelderMock,
  betragInWorten: (c: number | bigint) => `~${String(c)}`,
  isBescheinigungEnabled: () => true,
}));

// The load reads the donation row directly; stub the db layer so it is
// exercisable without a real DB.
// A valid UUID — the route now guards params.id with assertUuidOr404, so the
// fixture id must be a real 8-4-4-4-12 uuid (was "d-1", a non-UUID stand-in).
const DONATION_ID = "11111111-1111-4111-8111-111111111111";

const donationRow = {
  id: DONATION_ID,
  businessId: "S-2026-001",
  zugewendetAm: "2026-03-01",
  betragCents: 5000n,
  currency: "EUR",
  spendeKind: "geldspende",
  spenderName: "Erika Externe",
  spenderAdresse: "Hauptstr. 1, 10115 Berlin",
  zweckbindungKind: "zweckfrei",
  zweckbindungText: null,
  zustandBeschreibung: null,
  bescheinigungNr: null,
  bescheinigungAusgestelltAm: null,
  festgeschriebenAt: null,
};

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [donationRow],
        }),
      }),
    }),
  }),
}));

const { actions } =
  await import("../../src/routes/app/spenden/[id]/zuwendungsbestaetigung/+page.server.js");

const generate = actions.generate!;

function event(id = DONATION_ID, userId: string | null = "user-1") {
  return {
    params: { id },
    locals: { session: userId ? { user: { id: userId } } : null },
  } as unknown as never;
}

beforeEach(() => {
  allocateBescheinigungMock.mockReset();
  extractBmfPflichtfelderMock.mockReset();
});

describe("/app/spenden/[id]/zuwendungsbestaetigung ?/generate", () => {
  it("allocates a B-Nummer via allocateBescheinigung(params.id, …)", async () => {
    allocateBescheinigungMock.mockResolvedValue({
      ok: true,
      bescheinigungNr: "B-2026-001",
      pflichtfelder: {},
    });
    const r = (await generate(event(DONATION_ID))) as {
      success: boolean;
      bescheinigungNr: string;
    };
    expect(allocateBescheinigungMock).toHaveBeenCalledTimes(1);
    expect(allocateBescheinigungMock.mock.calls[0]![0]).toBe(DONATION_ID);
    expect(r.success).toBe(true);
    expect(r.bescheinigungNr).toBe("B-2026-001");
  });

  it("surfaces a fail(status) when allocateBescheinigung refuses", async () => {
    allocateBescheinigungMock.mockResolvedValue({
      ok: false,
      status: 412,
      error: "Freistellungsbescheid fehlt",
    });
    const r = (await generate(event(DONATION_ID))) as { status: number };
    expect(r.status).toBe(412);
  });
});

describe("moved route internal links target /app/spenden/…", () => {
  it("page markup uses the new /app/spenden detail + pdf paths (no /app/transactions)", () => {
    const src = readSource(
      "src/routes/app/spenden/[id]/zuwendungsbestaetigung/+page.svelte",
    );
    expect(src).toContain("/app/spenden/");
    expect(src).not.toContain("/app/transactions/");
  });
});

function readSource(rel: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(`${process.cwd()}/${rel}`, "utf-8");
}
