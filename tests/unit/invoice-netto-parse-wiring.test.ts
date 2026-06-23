/**
 * F24 (review F3) — invoice net-amount call-site wiring.
 *
 * The /new + /edit server actions convert the user-entered `nettoEur` string to
 * `nettoCents` before calling createInvoice/editInvoice. This test pins that the
 * conversion routes through the canonical parseEuroToCents — i.e. a German
 * thousands amount ("1.234,56") becomes 123456 cents and a dot-decimal
 * ("12.34") becomes 1234, NOT the 123400 the old replace(/\./g,"") produced.
 *
 * It mocks the invoices domain so the action's payload is captured directly.
 *
 * @vitest-environment node
 * @phase-11
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createInvoice = vi.fn();
const editInvoice = vi.fn();

vi.mock("$lib/server/domain/invoices.js", () => ({
  createInvoice: (...args: unknown[]) => createInvoice(...args),
  editInvoice: (...args: unknown[]) => editInvoice(...args),
}));

// The /new load() imports these; the action under test does not touch them, but
// the module-level imports must resolve. Stub the DB + year helper lightly.
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({}),
}));

function formRequest(fields: Record<string, string>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/app/rechnungen/new?/create", {
    method: "POST",
    body: fd,
  });
}

const baseFields = {
  customerId: "c1",
  rechnungsdatum: "2026-06-01",
  leistungszeitraum: "Juni 2026",
  bezeichnung: "Beratung",
};

describe("@phase-11 invoice /new action — nettoEur→nettoCents wiring (F24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ok:false so the action returns a fail() instead of throwing redirect —
    // we only care about the payload createInvoice was called with.
    createInvoice.mockResolvedValue({ ok: false, status: 422, error: "stop" });
    editInvoice.mockResolvedValue({ ok: false, status: 422, error: "stop" });
  });

  async function runCreate(nettoEur: string): Promise<Record<string, unknown>> {
    const { actions } =
      await import("../../src/routes/app/rechnungen/new/+page.server.js");
    await actions.create!({
      request: formRequest({ ...baseFields, nettoEur }),
      locals: { session: { user: { id: "u1" } } },
      url: new URL("http://localhost/app/rechnungen/new"),
    } as never);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    return createInvoice.mock.calls[0]![0] as Record<string, unknown>;
  }

  it("German thousands '1.234,56' → 123456 cents", async () => {
    const payload = await runCreate("1.234,56");
    expect(payload["nettoCents"]).toBe(123456);
    expect(payload["nettoEur"]).toBeUndefined();
  });

  it("dot-decimal '12.34' → 1234 cents (NOT 123400 — the old bug)", async () => {
    const payload = await runCreate("12.34");
    expect(payload["nettoCents"]).toBe(1234);
  });

  it("comma-decimal '12,50' → 1250 cents", async () => {
    const payload = await runCreate("12,50");
    expect(payload["nettoCents"]).toBe(1250);
  });
});

describe("@phase-11 invoice /edit action — nettoEur→nettoCents wiring (F24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editInvoice.mockResolvedValue({ ok: false, status: 422, error: "stop" });
  });

  async function runEdit(nettoEur: string): Promise<Record<string, unknown>> {
    const { actions } =
      await import("../../src/routes/app/rechnungen/[id]/edit/+page.server.js");
    await actions.edit!({
      request: formRequest({ ...baseFields, nettoEur }),
      params: { id: "11111111-1111-4111-8111-111111111111" },
      locals: { session: { user: { id: "u1" } } },
    } as never);
    expect(editInvoice).toHaveBeenCalledTimes(1);
    // editInvoice(id, raw, actorUserId) — payload is the 2nd arg.
    return editInvoice.mock.calls[0]![1] as Record<string, unknown>;
  }

  it("German thousands '1.234,56' → 123456 cents", async () => {
    const payload = await runEdit("1.234,56");
    expect(payload["nettoCents"]).toBe(123456);
  });

  it("dot-decimal '12.34' → 1234 cents (NOT 123400)", async () => {
    const payload = await runEdit("12.34");
    expect(payload["nettoCents"]).toBe(1234);
  });
});
