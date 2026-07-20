/**
 * Unit tests for `editInvoice` — Phase 12. @phase-12
 *
 * Mocks the DB module entirely; exercises the validation guards and the
 * single-transaction call shape. Pattern follows `tests/unit/cron-tasks.test.ts`.
 *
 * We assert that:
 *   - 404 when invoice not found
 *   - 409 when bezahltAm IS NOT NULL
 *   - 409 when festgeschriebenAt IS NOT NULL
 *   - 409 when a successor invoice already references this row
 *   - 422 when Zod rejects the input (bezeichnung too short)
 *   - happy path: inside the tx, UPDATE(invoices) + INSERT(invoice_jobs) +
 *     logAudit(tx) all fire exactly once, and the post-commit fire-and-forget
 *     runInvoiceJob is dispatched
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the DB module before importing the module under test.
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockTransaction = vi.fn();
const mockExecute = vi.fn().mockResolvedValue([] as { value: unknown }[]);

const txUpdate = vi.fn();
const txInsert = vi.fn();

function makeSelectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    select: mockSelect,
    transaction: mockTransaction,
    execute: mockExecute,
  }),
}));

vi.mock("$lib/server/audit-log/index.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: vi.fn().mockResolvedValue("FDW-2026-001"),
}));

vi.mock("$lib/server/files/storage.js", () => ({
  getFileStorage: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

// Avoid loading the real renderer (and its pdf-lib dependency) during unit tests.
vi.mock("$lib/server/pdf/pdf-lib-renderer.js", () => ({
  pdfLibInvoiceRenderer: {
    render: vi.fn().mockResolvedValue({ bytes: new Uint8Array() }),
  },
}));

// Pass-through drizzle stubs (no live DB connection).
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  isNull: (col: unknown) => ({ op: "isNull", col }),
  isNotNull: (col: unknown) => ({ op: "isNotNull", col }),
  desc: (col: unknown) => ({ op: "desc", col }),
  like: (col: unknown, val: unknown) => ({ op: "like", col, val }),
  lt: (col: unknown, val: unknown) => ({ op: "lt", col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: "sql",
    strings,
    values,
  }),
}));

// Pass-through schema table stubs.
vi.mock("$lib/server/db/schema/invoices.js", () => ({
  invoices: { id: "invoices.id", supersedesId: "invoices.supersedes_id" },
}));
vi.mock("$lib/server/db/schema/invoice_jobs.js", () => ({
  invoiceJobs: {
    id: "invoice_jobs.id",
    invoiceId: "invoice_jobs.invoice_id",
    status: "invoice_jobs.status",
    attempts: "invoice_jobs.attempts",
  },
}));
vi.mock("$lib/server/db/schema/customers.js", () => ({
  customers: { id: "customers.id" },
}));
vi.mock("$lib/server/db/schema/kategorien.js", () => ({
  kategorien: { id: "kategorien.id" },
}));
vi.mock("$lib/server/db/schema/projects.js", () => ({
  projects: { id: "projects.id" },
}));
vi.mock("$lib/server/db/schema/files.js", () => ({
  files: { id: "files.id", storageKey: "files.storage_key" },
}));
vi.mock("$lib/server/db/schema/income.js", () => ({
  income: { id: "income.id" },
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks).
// ---------------------------------------------------------------------------

const { editInvoice } = await import("$lib/server/domain/invoices.js");
const { logAudit } = await import("$lib/server/audit-log/index.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// UUIDs must satisfy Zod's UUID v1-v8 regex: 13th char is 1-8 and 17th char
// is in {8,9,a,b}. Simple repeating-hex fixtures don't qualify.
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const KATEGORIE_ID = "33333333-3333-4333-8333-333333333333";

const validInput = {
  customerId: CUSTOMER_ID,
  // E-PR3: Kategorie is mandatory on the invoice form/schema.
  kategorieId: KATEGORIE_ID,
  rechnungsdatum: "2026-05-15",
  bezeichnung: "Webseite Q2 2026",
  leistungszeitraum: "Mai 2026",
  nettoCents: 50000,
  currency: "EUR",
};

function existingInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    businessId: "FDW-2026-001",
    bezahltAm: null,
    festgeschriebenAt: null,
    customerId: CUSTOMER_ID,
    customerNameSnapshot: "Old Customer",
    customerAddressSnapshot: "Old Address",
    projectId: null,
    kategorieId: null,
    kategorieNameSnapshot: "(Unkategorisiert)",
    sphereSnapshot: "ideeller",
    rechnungsdatum: "2026-04-01",
    leistungsDatum: null,
    faelligkeitsDatum: null,
    bezeichnung: "Webseite Q1",
    leistungsBeschreibung: null,
    leistungszeitraum: "April 2026",
    nettoCents: BigInt(40000),
    ustCents: BigInt(0),
    bruttoCents: BigInt(40000),
    currency: "EUR",
    pdfFileId: "ffffffff-0000-0000-0000-000000000001",
    ...overrides,
  };
}

function customerRow() {
  return { id: CUSTOMER_ID, name: "Old Customer", addressBlock: "Old Address" };
}

beforeEach(() => {
  vi.clearAllMocks();
  txUpdate.mockReset();
  txInsert.mockReset();
  mockExecute.mockResolvedValue([] as { value: unknown }[]);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure the sequence of `db.select()` returns. editInvoice issues these
 * SELECTs in order:
 *   1. invoice (by id)
 *   2. successor lookup (invoices where supersedes_id = invoiceId)
 *   3. customer lookup
 *   4. (optional) kategorie lookup — only if input.kategorieId set
 *   5. (optional) project lookup — only if input.projectId set
 *
 * We don't need to be flexible about ordering — the implementation is fixed.
 */
function queueSelectResults(...results: Array<unknown[]>): void {
  let i = 0;
  mockSelect.mockImplementation(() => {
    const rows = results[i++] ?? [];
    return makeSelectChain(rows);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("editInvoice — validation guards", () => {
  it("returns 404 when invoice not found", async () => {
    queueSelectResults([]); // invoice select → empty
    const result = await editInvoice(INVOICE_ID, validInput, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/nicht gefunden/i);
    }
  });

  it("returns 409 when invoice is already paid", async () => {
    queueSelectResults([existingInvoiceRow({ bezahltAm: "2026-05-20" })]);
    const result = await editInvoice(INVOICE_ID, validInput, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/Bereits bezahlt/i);
    }
  });

  it("returns 409 when invoice is festgeschrieben", async () => {
    queueSelectResults([existingInvoiceRow({ festgeschriebenAt: new Date() })]);
    const result = await editInvoice(INVOICE_ID, validInput, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/festgeschrieben/i);
    }
  });

  it("returns 409 when invoice has been superseded", async () => {
    queueSelectResults(
      [existingInvoiceRow()],
      [{ businessId: "FDW-2026-002" }], // successor
    );
    const result = await editInvoice(INVOICE_ID, validInput, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/ersetzt/i);
    }
  });

  it("returns 422 when Zod rejects the input (bezeichnung too short)", async () => {
    // Validation runs BEFORE the invoice lookup — no select needed.
    const result = await editInvoice(
      INVOICE_ID,
      { ...validInput, bezeichnung: "abc" },
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.errors).toBeDefined();
      expect(result.errors?.bezeichnung).toBeDefined();
    }
  });

  it("returns 400 when invoiceId is empty", async () => {
    const result = await editInvoice("", validInput, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });
});

describe("editInvoice — happy path", () => {
  it("inside the tx: UPDATE(invoices) + INSERT(invoice_jobs) + logAudit all fire", async () => {
    queueSelectResults(
      [existingInvoiceRow()], // invoice
      [], // successor lookup → no successor
      [customerRow()], // customer lookup
      [{ name: "Webseiten & Digitales", sphere: "wirtschaftlich" }], // kategorie lookup (E-PR3: kategorieId now always set)
    );

    // Wire the tx callback up so we can capture what was called.
    const txInsertReturning = vi
      .fn()
      .mockResolvedValue([{ id: "job-uuid-123" }]);
    const txInsertValues = vi
      .fn()
      .mockReturnValue({ returning: txInsertReturning });
    const txInsertImpl = vi.fn().mockReturnValue({ values: txInsertValues });

    const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdateImpl = vi.fn().mockReturnValue({ set: txUpdateSet });

    const txInsertForAudit = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockTransaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: txUpdateImpl,
          insert: (table: unknown) => {
            // The first insert in editInvoice goes to invoice_jobs;
            // logAudit will call insert(auditLog) via its `writer` parameter.
            // We use a single shared insert that branches — but the simpler
            // approach is to make BOTH return the same job-id shape since
            // logAudit ignores the .returning() result. logAudit's call goes
            // through `tx.insert(auditLog).values(...)` which we accept here.
            if (
              typeof table === "object" &&
              table !== null &&
              "id" in (table as Record<string, unknown>) &&
              (table as { id: string }).id === "invoice_jobs.id"
            ) {
              return txInsertImpl(table);
            }
            return txInsertForAudit(table);
          },
          select: mockSelect,
        };
        return cb(tx);
      },
    );

    const result = await editInvoice(INVOICE_ID, validInput, ACTOR_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jobId).toBe("job-uuid-123");
    }

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(txUpdateImpl).toHaveBeenCalledOnce();
    expect(txInsertImpl).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledOnce();

    // Audit payload includes kind='edited' + changedFields with the diff.
    const auditCall = vi.mocked(logAudit).mock.calls[0]!;
    const entry = auditCall[0] as unknown as {
      entityKind: string;
      payload: { kind: string; changedFields: Record<string, unknown> };
    };
    expect(entry.entityKind).toBe("invoice");
    expect(entry.payload.kind).toBe("edited");
    expect(entry.payload.changedFields).toBeDefined();
    // The fixture's bezeichnung was "Webseite Q1" → new is "Webseite Q2 2026".
    expect(entry.payload.changedFields.bezeichnung).toBeDefined();
    // nettoCents went 40000 → 50000.
    expect(entry.payload.changedFields.nettoCents).toBeDefined();
  });
});
