/**
 * @phase-11 — POST /api/rechnungen/preview unit tests.
 *
 * Covers the hardening layer of the live-preview endpoint: session gating
 * and Zod payload bounds. We do NOT render a real PDF here (the renderer's
 * unit tests live in invoice-render.test.ts).
 */

import { describe, expect, it, vi } from "vitest";

// Mock DB so the endpoint never tries to talk to Postgres for these tests.
// The 401 path returns BEFORE any DB call; the 400 path returns BEFORE the
// settings+counter SELECTs. If we ever break that ordering, this mock would
// surface the regression as an "Unexpected DB call" error.
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => {
    throw new Error("unexpected DB call before auth/validation gate");
  },
}));

const { POST } = await import("$lib/../routes/api/rechnungen/preview/+server");

type Locals = { session?: { user?: { id: string } } | null };

function makeEvent(opts: { body?: unknown; locals?: Locals }): {
  request: Request;
  locals: Locals;
} {
  return {
    request: new Request("http://localhost/api/rechnungen/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
    }),
    locals: opts.locals ?? {},
  };
}

describe("POST /api/rechnungen/preview — hardening gates", () => {
  it("401 when no session is present", async () => {
    const event = makeEvent({ locals: {} });
    // SvelteKit's `error()` throws a HttpError; assert its status field.
    await expect(
      (POST as unknown as (e: unknown) => Promise<Response>)(event),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("401 when locals.session.user is missing", async () => {
    const event = makeEvent({ locals: { session: null } });
    await expect(
      (POST as unknown as (e: unknown) => Promise<Response>)(event),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("400 when payload is not valid JSON", async () => {
    const req = new Request("http://localhost/api/rechnungen/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await (POST as unknown as (e: unknown) => Promise<Response>)({
      request: req,
      locals: { session: { user: { id: "u1" } } },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_payload");
  });

  it("400 when nettoCents exceeds upper bound", async () => {
    const event = makeEvent({
      locals: { session: { user: { id: "u1" } } },
      body: { nettoCents: 10_000_000_01 }, // one cent over 100 Mio EUR
    });
    const res = await (POST as unknown as (e: unknown) => Promise<Response>)(
      event,
    );
    expect(res.status).toBe(400);
  });

  it("400 when bezeichnung exceeds max length", async () => {
    const event = makeEvent({
      locals: { session: { user: { id: "u1" } } },
      body: { bezeichnung: "a".repeat(2001) },
    });
    const res = await (POST as unknown as (e: unknown) => Promise<Response>)(
      event,
    );
    expect(res.status).toBe(400);
  });

  it("400 when customerCountry has non-letter characters", async () => {
    const event = makeEvent({
      locals: { session: { user: { id: "u1" } } },
      body: { customerCountry: "D3" },
    });
    const res = await (POST as unknown as (e: unknown) => Promise<Response>)(
      event,
    );
    expect(res.status).toBe(400);
  });

  it("validation passes for the form's pre-hydration empty-shape payload", async () => {
    // Mirrors exactly what `<InvoicePdfPreview>` POSTs on first mount before
    // the parent InvoiceForm's hydration $effect propagates `data.today`.
    // If validation fails here, the user sees a stuck preview badge in
    // production — regression-guard with the precise shape the client sends.
    const event = makeEvent({
      locals: { session: { user: { id: "u1" } } },
      body: {
        customerId: "",
        customerName: "",
        customerAddressBlock: null,
        customerCountry: "DE",
        rechnungsdatum: "",
        leistungsDatum: null,
        faelligkeitsDatum: null,
        leistungszeitraum: null,
        bezeichnung: "",
        leistungsBeschreibung: null,
        nettoCents: 0,
        currency: "EUR",
      },
    });
    // The DB mock throws after validation passes — that proves the schema
    // accepted the payload (failure would be a 400 returned, not a throw).
    await expect(
      (POST as unknown as (e: unknown) => Promise<Response>)(event),
    ).rejects.toThrow(/unexpected DB call/);
  });
});
