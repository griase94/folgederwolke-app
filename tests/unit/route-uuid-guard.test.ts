/**
 * @vitest-environment node
 * @phase-11
 *
 * R18 regression guard (review item 3): prove the [id] routes actually INVOKE
 * the uuid guard — a non-UUID id must throw a 404 HttpError BEFORE any uuid
 * column query (so it can never surface as a PostgresError 22P02 → 500).
 *
 * assertUuidOr404 throws at the very top of each load/action, before getDb() is
 * touched, so these can run without a live DB. We pass params.id="FDW-2026-003"
 * (the exact business-id that triggered the original F12/F13/F14 500) and assert
 * status === 404. A `getTransactionDetail("not-a-uuid")` case exercises the REAL
 * function (no mock) to pin its isUuid → null guard.
 */

import { describe, it, expect } from "vitest";

const BAD_ID = "FDW-2026-003"; // non-UUID — the F12/F13 bug input

type Loaded = { load?: unknown; actions?: Record<string, unknown> };

/** Assert that running `fn` throws a SvelteKit HttpError with status 404. */
async function expect404(fn: () => unknown): Promise<void> {
  let err: unknown;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  expect(err, "expected a throw").toBeDefined();
  const status = (err as { status?: number }).status;
  expect(status).toBe(404);
}

function loadEvent(extra: Record<string, unknown> = {}) {
  return {
    params: { id: BAD_ID },
    url: new URL(`http://localhost/app/x/${BAD_ID}`),
    locals: { session: { user: { id: "u1", role: "admin" } } },
    parent: async () => ({}),
    ...extra,
  } as never;
}

function actionEvent(extra: Record<string, unknown> = {}) {
  const fd = new FormData();
  fd.set("year", "2026");
  return {
    params: { id: BAD_ID },
    url: new URL(`http://localhost/app/x/${BAD_ID}`),
    locals: { session: { user: { id: "u1", role: "admin" } } },
    request: new Request("http://localhost/x", { method: "POST", body: fd }),
    ...extra,
  } as never;
}

// ── Loaders ────────────────────────────────────────────────────────────────

const LOADER_MODULES: Array<[string, string]> = [
  ["rechnungen/[id]", "../../src/routes/app/rechnungen/[id]/+page.server.js"],
  [
    "rechnungen/[id]/edit",
    "../../src/routes/app/rechnungen/[id]/edit/+page.server.js",
  ],
  ["kunden/[id]", "../../src/routes/app/kunden/[id]/+page.server.js"],
  ["projekte/[id]", "../../src/routes/app/projekte/[id]/+page.server.js"],
  ["mitglieder/[id]", "../../src/routes/app/mitglieder/[id]/+page.server.js"],
  [
    "spenden/[id]/zuwendungsbestaetigung",
    "../../src/routes/app/spenden/[id]/zuwendungsbestaetigung/+page.server.js",
  ],
];

describe("@phase-11 [id] route load() guards (non-UUID → 404, not 22P02)", () => {
  it.each(LOADER_MODULES)("%s load() throws 404", async (_name, mod) => {
    const { load } = (await import(mod)) as Loaded;
    expect(typeof load).toBe("function");
    await expect404(() => (load as (e: never) => unknown)(loadEvent()));
  });
});

// ── Actions ──────────────────────────────────────────────────────────────────

const ACTION_CASES: Array<[string, string, string]> = [
  [
    "rechnungen edit",
    "../../src/routes/app/rechnungen/[id]/edit/+page.server.js",
    "edit",
  ],
  [
    "rechnungen mark-paid",
    "../../src/routes/app/rechnungen/[id]/+page.server.js",
    "mark-paid",
  ],
  [
    "kunden delete",
    "../../src/routes/app/kunden/[id]/+page.server.js",
    "delete",
  ],
  [
    "projekte delete",
    "../../src/routes/app/projekte/[id]/+page.server.js",
    "delete",
  ],
  [
    "mitglieder delete",
    "../../src/routes/app/mitglieder/[id]/+page.server.js",
    "delete",
  ],
  [
    "mitglieder mark-beitrag-paid",
    "../../src/routes/app/mitglieder/[id]/+page.server.js",
    "mark-beitrag-paid",
  ],
  [
    "spenden zuwendungsbestaetigung generate",
    "../../src/routes/app/spenden/[id]/zuwendungsbestaetigung/+page.server.js",
    "generate",
  ],
];

describe("@phase-11 [id] route action guards (non-UUID → 404, not 22P02)", () => {
  it.each(ACTION_CASES)(
    "%s action throws 404",
    async (_name, mod, actionName) => {
      const { actions } = (await import(mod)) as Loaded;
      const fn = actions?.[actionName];
      expect(typeof fn).toBe("function");
      await expect404(() => (fn as (e: never) => unknown)(actionEvent()));
    },
  );
});

// ── getTransactionDetail (REAL function, no mock) ────────────────────────────

describe("@phase-11 getTransactionDetail isUuid guard", () => {
  it.each(["expense", "income", "donation"] as const)(
    "returns null for a non-UUID id (kind=%s) without a DB query",
    async (kind) => {
      const { getTransactionDetail } =
        await import("$lib/server/domain/transactions.js");
      await expect(
        getTransactionDetail("not-a-uuid", kind),
      ).resolves.toBeNull();
    },
  );
});
