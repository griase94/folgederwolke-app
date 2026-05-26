/**
 * Unit tests for `markInvoiceAsPaid` + `undoPayment` — Phase 12. @phase-12
 *
 * Mocks the DB module entirely; exercises the validation guards and the
 * single-transaction call shape. Pattern follows `tests/unit/cron-tasks.test.ts`.
 *
 * Asserts (markInvoiceAsPaid):
 *   - 404 when invoice not found
 *   - 409 when invoice already paid
 *   - 409 when festgeschrieben (on the invoice itself)
 *   - 409 when superseded
 *   - 400 when bezahltAm is in the future
 *   - Happy path: pre-allocate businessId, then inside the tx
 *     INSERT(income) + UPDATE(invoices) + logAudit(twice for invoice + income)
 *     all fire on the tx handle.
 *
 * Asserts (undoPayment):
 *   - 409 when bezahltAm is not today
 *   - 409 when paid_by_income_id null
 *   - Happy path: nullifies invoice payment fields + DELETEs income +
 *     logAudit(payment_undone).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the DB module + dependencies before importing the SUT.
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockTransaction = vi.fn();
const mockExecute = vi.fn().mockResolvedValue([] as { value: unknown }[]);

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
  allocateBusinessId: vi.fn().mockResolvedValue("E-2026-007"),
}));

vi.mock("$lib/server/files/storage.js", () => ({
  getFileStorage: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("$lib/server/pdf/pdf-lib-renderer.js", () => ({
  pdfLibInvoiceRenderer: {
    render: vi.fn().mockResolvedValue({ bytes: new Uint8Array() }),
  },
}));

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
// Import after mocks.
// ---------------------------------------------------------------------------

const { markInvoiceAsPaid, undoPayment } =
  await import("$lib/server/domain/invoices.js");
const { logAudit } = await import("$lib/server/audit-log/index.js");
const { allocateBusinessId } =
  await import("$lib/server/domain/id-allocator.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const INCOME_ID_NEW = "33333333-3333-4333-8333-333333333333";
const INCOME_ID_OLD = "44444444-4444-4444-4444-444444444444"; // can be any v
const KATEGORIE_ID = "55555555-5555-4555-8555-555555555555";

function todayBerlinIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function tomorrowBerlinIso(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    businessId: "FDW-2026-001",
    bezahltAm: null,
    paidByIncomeId: null,
    festgeschriebenAt: null,
    rechnungsdatum: "2026-05-15",
    yearOfBuchung: 2026,
    customerId: "22222222-2222-4222-8222-222222222222",
    customerNameSnapshot: "Kunde",
    customerAddressSnapshot: "Adresse",
    kategorieId: KATEGORIE_ID,
    kategorieNameSnapshot: "Spende",
    sphereSnapshot: "ideeller",
    bezeichnung: "Webseite Q1",
    nettoCents: BigInt(40000),
    ustCents: BigInt(0),
    bruttoCents: BigInt(40000),
    currency: "EUR",
    ...overrides,
  };
}

function queueSelectResults(...results: Array<unknown[]>): void {
  let i = 0;
  mockSelect.mockImplementation(() => {
    const rows = results[i++] ?? [];
    return makeSelectChain(rows);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute.mockResolvedValue([] as { value: unknown }[]);
});

// ---------------------------------------------------------------------------
// markInvoiceAsPaid
// ---------------------------------------------------------------------------

describe("markInvoiceAsPaid — validation guards", () => {
  it("returns 404 when invoice not found", async () => {
    queueSelectResults([]);
    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      todayBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("returns 409 when invoice already paid", async () => {
    queueSelectResults([invoiceRow({ bezahltAm: "2026-05-10" })]);
    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      todayBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/bereits/i);
    }
  });

  it("returns 409 when invoice is festgeschrieben", async () => {
    queueSelectResults([invoiceRow({ festgeschriebenAt: new Date() })]);
    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      todayBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/festgeschrieben/i);
    }
  });

  it("returns 400 when bezahltAm is in the future", async () => {
    queueSelectResults(
      [invoiceRow()],
      [], // successor lookup → none
    );
    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      tomorrowBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/Zukunft/i);
    }
  });

  it("returns 409 when invoice has been superseded", async () => {
    queueSelectResults(
      [invoiceRow()],
      [{ businessId: "FDW-2026-002" }], // successor
    );
    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      todayBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/ersetzt/i);
    }
  });

  it("returns 400 when bezahltAm has invalid format", async () => {
    const result = await markInvoiceAsPaid(INVOICE_ID, "15.05.2026", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });
});

describe("markInvoiceAsPaid — happy path", () => {
  it("pre-allocates incomeBusinessId, then INSERT income + UPDATE invoice + 2x logAudit", async () => {
    queueSelectResults(
      [invoiceRow()], // invoice lookup
      [], // successor lookup → none
    );

    const txInsertReturning = vi
      .fn()
      .mockResolvedValue([{ id: INCOME_ID_NEW }]);
    const txInsertValues = vi
      .fn()
      .mockReturnValue({ returning: txInsertReturning });
    const txInsertImpl = vi.fn().mockReturnValue({ values: txInsertValues });

    const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdateImpl = vi.fn().mockReturnValue({ set: txUpdateSet });

    mockTransaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: txUpdateImpl,
          insert: txInsertImpl,
        };
        return cb(tx);
      },
    );

    const result = await markInvoiceAsPaid(
      INVOICE_ID,
      todayBerlinIso(),
      ACTOR_ID,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.incomeId).toBe(INCOME_ID_NEW);
    }

    // businessId pre-allocated OUTSIDE the tx (allocator runs its own tx).
    expect(allocateBusinessId).toHaveBeenCalledWith("E", expect.any(Number));
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Inside the tx: 1 INSERT (income), 1 UPDATE (invoices), 2 logAudit calls.
    expect(txInsertImpl).toHaveBeenCalledOnce();
    expect(txUpdateImpl).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledTimes(2);

    // First audit: kind='paid' on the invoice.
    const auditCalls = vi.mocked(logAudit).mock.calls;
    const invoiceAudit = auditCalls[0]![0] as unknown as {
      entityKind: string;
      payload: {
        kind: string;
        bezahltAm: string;
        incomeId: string;
        incomeBusinessId: string;
        betragCents: number;
      };
    };
    expect(invoiceAudit.entityKind).toBe("invoice");
    expect(invoiceAudit.payload.kind).toBe("paid");
    expect(invoiceAudit.payload.incomeId).toBe(INCOME_ID_NEW);
    expect(invoiceAudit.payload.incomeBusinessId).toBe("E-2026-007");
    expect(invoiceAudit.payload.betragCents).toBe(40000);

    // Second audit: kind='created_from_invoice' on the income row.
    const incomeAudit = auditCalls[1]![0] as unknown as {
      entityKind: string;
      entityId: string;
      payload: { kind: string; invoiceId: string };
    };
    expect(incomeAudit.entityKind).toBe("income");
    expect(incomeAudit.entityId).toBe(INCOME_ID_NEW);
    expect(incomeAudit.payload.kind).toBe("created_from_invoice");
    expect(incomeAudit.payload.invoiceId).toBe(INVOICE_ID);
  });
});

// ---------------------------------------------------------------------------
// undoPayment
// ---------------------------------------------------------------------------

describe("undoPayment — validation guards", () => {
  it("returns 409 when invoice has no bezahltAm", async () => {
    queueSelectResults([invoiceRow({ bezahltAm: null, paidByIncomeId: null })]);
    const result = await undoPayment(INVOICE_ID, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/nicht als bezahlt/i);
    }
  });

  it("returns 409 when paid_by_income_id is null", async () => {
    queueSelectResults([
      invoiceRow({ bezahltAm: todayBerlinIso(), paidByIncomeId: null }),
    ]);
    const result = await undoPayment(INVOICE_ID, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
  });

  it("returns 409 when bezahltAm is not today (next-day rejection)", async () => {
    queueSelectResults([
      invoiceRow({ bezahltAm: "2020-01-01", paidByIncomeId: INCOME_ID_OLD }),
    ]);
    const result = await undoPayment(INVOICE_ID, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/selben Tag/i);
    }
  });

  it("returns 404 when invoice not found", async () => {
    queueSelectResults([]);
    const result = await undoPayment(INVOICE_ID, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});

describe("undoPayment — happy path", () => {
  it("clears invoice payment fields + DELETEs income + writes audit row", async () => {
    queueSelectResults([
      invoiceRow({
        bezahltAm: todayBerlinIso(),
        paidByIncomeId: INCOME_ID_OLD,
      }),
    ]);

    const txUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdateImpl = vi.fn().mockReturnValue({ set: txUpdateSet });

    const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
    const txDeleteImpl = vi.fn().mockReturnValue({ where: txDeleteWhere });

    mockTransaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          update: txUpdateImpl,
          delete: txDeleteImpl,
        };
        return cb(tx);
      },
    );

    const result = await undoPayment(INVOICE_ID, ACTOR_ID);
    expect(result.ok).toBe(true);

    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(txUpdateImpl).toHaveBeenCalledOnce();
    expect(txDeleteImpl).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledOnce();

    const audit = vi.mocked(logAudit).mock.calls[0]![0] as unknown as {
      entityKind: string;
      payload: { kind: string; previousIncomeId: string };
    };
    expect(audit.entityKind).toBe("invoice");
    expect(audit.payload.kind).toBe("payment_undone");
    expect(audit.payload.previousIncomeId).toBe(INCOME_ID_OLD);
  });
});
