/**
 * @vitest-environment node
 * @phase-6
 *
 * Unit tests for /app/rechnungen `load` — searchParams wiring.
 *
 * Background: dashboard chip "Offene Rechnungen" links to
 *   /app/rechnungen?status=offen&year=2026
 * but the +page.server.ts load() previously ignored URL params and returned
 * the full unfiltered list. We mock the domain `listInvoices` and assert that
 * load() forwards the right ListInvoicesOptions to it.
 *
 * We don't hit a real DB — listInvoices is mocked; we test the param-parsing
 * + delegation seam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ListInvoicesOptions } from "$lib/server/domain/invoices.js";

const { listInvoicesMock, listInvoicesMetaMock } = vi.hoisted(() => ({
  listInvoicesMock: vi.fn<(opts?: unknown) => Promise<unknown[]>>(
    async () => [],
  ),
  listInvoicesMetaMock: vi.fn<(opts?: unknown) => Promise<unknown>>(
    async () => ({
      all: 0,
      offen: 0,
      ueberfaellig: 0,
      bezahlt: 0,
      offenSummeCents: 0,
    }),
  ),
}));

vi.mock("$lib/server/domain/invoices.js", () => ({
  listInvoices: listInvoicesMock,
  listInvoicesMeta: listInvoicesMetaMock,
}));

import { load } from "./+page.server.js";

function callOpts(callIndex = 0): ListInvoicesOptions {
  const call = listInvoicesMock.mock.calls[callIndex];
  if (!call) throw new Error(`no listInvoices call at index ${callIndex}`);
  return call[0] as ListInvoicesOptions;
}

function fakeEvent(search: string) {
  const url = new URL(`http://localhost/app/rechnungen${search}`);
  return { url } as Parameters<typeof load>[0];
}

beforeEach(() => {
  listInvoicesMock.mockClear();
});

describe("load: searchParams -> listInvoices options", () => {
  it("status=offen&year=2026 → forwards status=offen and year=2026", async () => {
    await load(fakeEvent("?status=offen&year=2026"));
    expect(listInvoicesMock).toHaveBeenCalledTimes(1);
    const opts = callOpts();
    expect(opts.status).toBe("offen");
    expect(opts.year).toBe(2026);
  });

  it("unknown status=foo falls back to status='alle' (show all)", async () => {
    await load(fakeEvent("?status=foo&year=2026"));
    const opts = callOpts();
    expect(opts.status).toBe("alle");
    expect(opts.year).toBe(2026);
  });

  it("no params → defaults to status='alle' + current Berlin year", async () => {
    await load(fakeEvent(""));
    const opts = callOpts();
    expect(opts.status).toBe("alle");
    expect(typeof opts.year).toBe("number");
    expect(opts.year).toBeGreaterThanOrEqual(2026);
  });

  it("garbage year=abc falls back to default year", async () => {
    await load(fakeEvent("?status=offen&year=abc"));
    const opts = callOpts();
    expect(opts.status).toBe("offen");
    expect(typeof opts.year).toBe("number");
    expect(opts.year).toBeGreaterThanOrEqual(2026);
  });
});

describe("load: returns filters in pageData for the UI banner", () => {
  it("exposes the active filters under data.filters", async () => {
    const result = await load(fakeEvent("?status=offen&year=2026"));
    expect((result as { filters: unknown }).filters).toEqual({
      status: "offen",
      year: 2026,
    });
  });
});
