/**
 * @vitest-environment node
 * @phase-entry-modals
 *
 * A4 tests for Package A (THE BELEG RULE — audit-inbox path).
 *
 * Coverage:
 *   - manualImportSubmission persists belegFileId XOR belegVerzichtGrund
 *   - approveSubmission of a Verzicht submission yields an expense row with
 *     belegVerzichtGrund and never raises SQLSTATE 23514
 *   - approveSubmission of a (now-impossible) NULL/NULL row maps 23514 → 409
 *
 * The ?/manual-import 422-when-neither-arm test is NOT here because it
 * requires the SvelteKit action layer — that's covered in A3 integration tests
 * (manual-import-action.test.ts) once the action is rewritten.
 *
 * Strategy: same in-memory mock pattern as audit-inbox-actions.test.ts —
 * no DB required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// In-memory stores (same shape as audit-inbox-actions.test.ts)
// ---------------------------------------------------------------------------

interface SubmissionRow {
  id: string;
  businessId: string;
  bezeichnung: string;
  kommentar: string | null;
  rechnungsdatum: string | null;
  betragCents: bigint;
  currency: string;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId: string | null;
  externName: string | null;
  externIban: string | null;
  externEmail: string | null;
  bezahltVonDisplay: string;
  belegDriveFileId: string | null;
  belegOriginalName: string | null;
  belegFileId: string | null;
  belegVerzichtGrund: string | null;
  decidedAt: Date | null;
  decision: string | null;
  decidedByUserId: string | null;
  decisionReason: string | null;
  approvedExpenseId: string | null;
  reviewedAt: Date | null;
}

interface ExpenseRow {
  id: string;
  businessId: string;
  bezeichnung: string;
  betragCents: bigint;
  gebuchtAm: Date;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  erstattetAm: string | null;
  zahlungsartId: string | null;
  status: string;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId: string | null;
  externName: string | null;
  externIban: string | null;
  externEmail: string | null;
  kategorieId: string | null;
  kategorieNameSnapshot: string | null;
  sphereSnapshot: string | null;
  belegFileId: string | null;
  belegVerzichtGrund: string | null;
}

interface KategorieRow {
  id: string;
  kind: "expense" | "income";
  name: string;
  sphere: string;
}

const submissionsStore = new Map<string, SubmissionRow>();
const expensesStore = new Map<string, ExpenseRow>();
const kategorienStore = new Map<string, KategorieRow>();
let festBisOverride: number | null = null;
let nextId = 1;
// When true, the next expenses INSERT throws a SQLSTATE 23514 check violation.
let checkViolationOnNextInsert = false;

function makeSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  const id = overrides.id ?? `sub-${nextId++}`;
  const row: SubmissionRow = {
    id,
    businessId: overrides.businessId ?? `AUS-2026-${id.slice(-3)}`,
    bezeichnung: "Druckerpapier",
    kommentar: null,
    rechnungsdatum: "2026-05-01",
    betragCents: 2350n,
    currency: "EUR",
    bezahltVonKind: "verein",
    bezahltVonMemberId: null,
    externName: null,
    externIban: null,
    externEmail: null,
    bezahltVonDisplay: "Verein",
    belegDriveFileId: null,
    belegOriginalName: null,
    belegFileId: null,
    belegVerzichtGrund: null,
    decidedAt: null,
    decision: null,
    decidedByUserId: null,
    decisionReason: null,
    approvedExpenseId: null,
    reviewedAt: null,
    ...overrides,
  };
  submissionsStore.set(id, row);
  return row;
}

// ---------------------------------------------------------------------------
// Drizzle-shaped fake (minimal — covers only the calls these tests exercise)
// ---------------------------------------------------------------------------

function makeDbFake() {
  function select() {
    const ctx: {
      table: "submissions" | "expenses" | "members" | "kategorien";
      whereField?: string;
      whereValue?: unknown;
    } = { table: "submissions" };

    const chain = {
      from(table: { _kind?: string } & Record<string, unknown>) {
        ctx.table =
          (table._kind as
            | "submissions"
            | "expenses"
            | "members"
            | "kategorien") ?? "submissions";
        return chain;
      },
      where(cond: { field?: string; value?: unknown }) {
        if (cond?.field) {
          ctx.whereField = cond.field;
          ctx.whereValue = cond.value;
        }
        return chain;
      },
      leftJoin() {
        return chain;
      },
      limit() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown) {
        let rows: unknown[];
        if (ctx.table === "submissions") {
          rows = [...submissionsStore.values()].filter((r) =>
            ctx.whereField
              ? (r as unknown as Record<string, unknown>)[ctx.whereField] ===
                ctx.whereValue
              : true,
          );
        } else if (ctx.table === "expenses") {
          rows = [...expensesStore.values()].filter((r) =>
            ctx.whereField
              ? (r as unknown as Record<string, unknown>)[ctx.whereField] ===
                ctx.whereValue
              : true,
          );
        } else if (ctx.table === "kategorien") {
          rows = [...kategorienStore.values()].filter((r) =>
            ctx.whereField
              ? (r as unknown as Record<string, unknown>)[ctx.whereField] ===
                ctx.whereValue
              : true,
          );
        } else {
          rows = [];
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  }

  function insert(table: { _kind?: string }) {
    const tableKind = table._kind ?? "expenses";
    const ctx: { values: Record<string, unknown> } = { values: {} };
    const chain = {
      values(v: Record<string, unknown>) {
        ctx.values = v;
        return chain;
      },
      returning() {
        if (tableKind === "expenses") {
          if (checkViolationOnNextInsert) {
            checkViolationOnNextInsert = false;
            const err = new Error(
              `new row violates check constraint "expenses_beleg_or_grund_ck"`,
            ) as Error & { code?: string };
            err.code = "23514";
            return Promise.reject(err);
          }
          const id = `exp-${nextId++}`;
          const row: ExpenseRow = {
            id,
            businessId:
              (ctx.values.businessId as string) ?? `AUS-NEW-${nextId}`,
            bezeichnung: (ctx.values.bezeichnung as string) ?? "Test",
            betragCents: (ctx.values.betragCents as bigint) ?? 0n,
            gebuchtAm: new Date(),
            approvedAt: (ctx.values.approvedAt as Date) ?? new Date(),
            approvedByUserId: (ctx.values.approvedByUserId as string) ?? null,
            erstattetAm: null,
            zahlungsartId: null,
            status: (ctx.values.status as string) ?? "geprueft",
            bezahltVonKind: (ctx.values.bezahltVonKind as "verein") ?? "verein",
            bezahltVonMemberId:
              (ctx.values.bezahltVonMemberId as string | null) ?? null,
            externName: (ctx.values.externName as string | null) ?? null,
            externIban: null,
            externEmail: (ctx.values.externEmail as string | null) ?? null,
            kategorieId: (ctx.values.kategorieId as string | null) ?? null,
            kategorieNameSnapshot:
              (ctx.values.kategorieNameSnapshot as string | null) ?? null,
            sphereSnapshot:
              (ctx.values.sphereSnapshot as string | null) ?? null,
            belegFileId: (ctx.values.belegFileId as string | null) ?? null,
            belegVerzichtGrund:
              (ctx.values.belegVerzichtGrund as string | null) ?? null,
          };
          expensesStore.set(id, row);
          return Promise.resolve([{ id: row.id, businessId: row.businessId }]);
        }
        // submissions insert (manualImportSubmission)
        const id = `sub-${nextId++}`;
        const row: SubmissionRow = {
          id,
          businessId: (ctx.values.businessId as string) ?? `AUS-2026-${nextId}`,
          bezeichnung: (ctx.values.bezeichnung as string) ?? "Test",
          kommentar: (ctx.values.kommentar as string | null) ?? null,
          rechnungsdatum: (ctx.values.rechnungsdatum as string | null) ?? null,
          betragCents: (ctx.values.betragCents as bigint) ?? 0n,
          currency: (ctx.values.currency as string) ?? "EUR",
          bezahltVonKind: (ctx.values.bezahltVonKind as "verein") ?? "verein",
          bezahltVonMemberId:
            (ctx.values.bezahltVonMemberId as string | null) ?? null,
          externName: (ctx.values.externName as string | null) ?? null,
          externIban: (ctx.values.externIban as string | null) ?? null,
          externEmail: (ctx.values.externEmail as string | null) ?? null,
          bezahltVonDisplay:
            (ctx.values.bezahltVonDisplay as string) ?? "Verein",
          belegDriveFileId:
            (ctx.values.belegDriveFileId as string | null) ?? null,
          belegOriginalName:
            (ctx.values.belegOriginalName as string | null) ?? null,
          belegFileId: (ctx.values.belegFileId as string | null) ?? null,
          belegVerzichtGrund:
            (ctx.values.belegVerzichtGrund as string | null) ?? null,
          decidedAt: null,
          decision: null,
          decidedByUserId: null,
          decisionReason: null,
          approvedExpenseId: null,
          reviewedAt: null,
        };
        submissionsStore.set(id, row);
        return Promise.resolve([{ id }]);
      },
    };
    return chain;
  }

  function update(table: { _kind?: string }) {
    const tableKind = table._kind ?? "submissions";
    const ctx: {
      values: Record<string, unknown>;
      whereField?: string;
      whereValue?: unknown;
    } = { values: {} };
    const chain = {
      set(v: Record<string, unknown>) {
        ctx.values = v;
        return chain;
      },
      where(cond: { field?: string; value?: unknown }) {
        if (cond?.field) {
          ctx.whereField = cond.field;
          ctx.whereValue = cond.value;
        }
        return chain;
      },
      returning() {
        const store =
          tableKind === "submissions" ? submissionsStore : expensesStore;
        const changed: { id: string }[] = [];
        for (const row of store.values()) {
          const r = row as unknown as Record<string, unknown>;
          if (ctx.whereField && r[ctx.whereField] !== ctx.whereValue) continue;
          Object.assign(row, ctx.values);
          changed.push({ id: r.id as string });
        }
        return Promise.resolve(changed);
      },
      then(resolve: (n: number) => unknown) {
        return Promise.resolve(0).then(resolve);
      },
    };
    return chain;
  }

  async function execute<T = unknown>(): Promise<T[]> {
    if (festBisOverride === null) return [] as T[];
    return [{ value: festBisOverride }] as unknown as T[];
  }

  async function transaction<R>(fn: (tx: unknown) => Promise<R>): Promise<R> {
    return fn(tx);
  }

  const tx = { insert, update, select, execute };
  return { insert, update, select, execute, transaction, _tx: tx };
}

const dbFake = makeDbFake();

vi.mock("$lib/server/db/index.js", () => ({ getDb: () => dbFake }));

vi.mock("$lib/server/db/schema/auslagen_submissions.js", () => ({
  auslagenSubmissions: {
    _kind: "submissions",
    id: "id",
    businessId: "businessId",
    reviewedAt: "reviewedAt",
  },
}));

vi.mock("$lib/server/db/schema/expenses.js", () => ({
  expenses: {
    _kind: "expenses",
    id: "id",
    businessId: "businessId",
    erstattetAm: "erstattetAm",
  },
}));

vi.mock("$lib/server/db/schema/members.js", () => ({
  members: { _kind: "members", id: "id", email: "email", vorname: "vorname" },
}));

vi.mock("$lib/server/db/schema/kategorien.js", () => ({
  kategorien: {
    _kind: "kategorien",
    id: "id",
    kind: "kind",
    name: "name",
    sphere: "sphere",
  },
}));

vi.mock("drizzle-orm", async () => ({
  eq: (col: string, val: unknown) => ({ field: col, value: val }),
  and: (a: unknown) => a,
  sql: (strings: TemplateStringsArray) => ({ strings }),
  desc: (c: unknown) => c,
  isNull: (c: unknown) => ({ field: c, value: null }),
  isNotNull: (c: unknown) => ({ field: c, value: "__notNull__" }),
}));

vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: vi.fn(async () => undefined) },
  registerHandlers: () => undefined,
}));

vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: async (kind: string, year: number) =>
    `${kind}-${year}-A4`,
}));

vi.mock("$lib/server/domain/datenschutz.js", () => ({
  DATENSCHUTZ_VERSION: "2026-01",
}));

vi.mock("$lib/server/domain/auslagen.js", () => ({
  composeBezahltVonDisplay: () => "Verein",
}));

// SUT — import AFTER all vi.mock() declarations
const { manualImportSubmission, approveSubmission } =
  await import("$lib/server/domain/audit-inbox-actions.js");

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  submissionsStore.clear();
  expensesStore.clear();
  kategorienStore.clear();
  festBisOverride = null;
  nextId = 1;
  checkViolationOnNextInsert = false;

  kategorienStore.set("kat-buero", {
    id: "kat-buero",
    kind: "expense",
    name: "Bürobedarf",
    sphere: "wirtschaftlich",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// A4a: manualImportSubmission persists belegFileId XOR belegVerzichtGrund
// ---------------------------------------------------------------------------

describe("manualImportSubmission — THE BELEG RULE (A4)", () => {
  const BASE_INPUT = {
    bezahlt_von: { kind: "verein" as const },
    bezeichnung: "Druckerpapier",
    betragCents: 2350,
    actorUserId: "admin-1",
  };

  it("persists belegFileId (ARM A) when a file UUID is provided", async () => {
    const result = await manualImportSubmission({
      ...BASE_INPUT,
      belegFileId: "file-uuid-1234",
      belegVerzichtGrund: null,
    });

    expect(result.submissionId).toBeTruthy();
    const row = submissionsStore.get(result.submissionId)!;
    expect(row).toBeDefined();
    expect(row.belegFileId).toBe("file-uuid-1234");
    expect(row.belegVerzichtGrund).toBeNull();
  });

  it("persists belegVerzichtGrund (ARM B) when kein-Beleg with reason", async () => {
    const result = await manualImportSubmission({
      ...BASE_INPUT,
      belegFileId: null,
      belegVerzichtGrund: "Quittung verloren gegangen",
    });

    expect(result.submissionId).toBeTruthy();
    const row = submissionsStore.get(result.submissionId)!;
    expect(row).toBeDefined();
    expect(row.belegVerzichtGrund).toBe("Quittung verloren gegangen");
    expect(row.belegFileId).toBeNull();
  });

  it("stores both as null when neither is provided (pre-constraint legacy path)", async () => {
    // The app gate in A3 prevents this — but the domain helper itself does not
    // enforce the rule (the DB CHECK does). This test confirms the helper is
    // a pass-through and the DB constraint is the authoritative enforcer.
    const result = await manualImportSubmission({
      ...BASE_INPUT,
      // neither belegFileId nor belegVerzichtGrund
    });
    const row = submissionsStore.get(result.submissionId)!;
    expect(row.belegFileId).toBeNull();
    expect(row.belegVerzichtGrund).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A4b: approveSubmission of a Verzicht submission copies belegVerzichtGrund
// ---------------------------------------------------------------------------

describe("approveSubmission — copies belegVerzichtGrund (A4)", () => {
  it("expense row inherits belegVerzichtGrund from a Verzicht submission", async () => {
    const sub = makeSubmission({
      belegFileId: null,
      belegVerzichtGrund: "Quittung verloren gegangen",
    });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieId: "kat-buero",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);

    const exp = expensesStore.get(result.expenseId)!;
    expect(exp).toBeDefined();
    expect(exp.belegVerzichtGrund).toBe("Quittung verloren gegangen");
    expect(exp.belegFileId).toBeNull();
  });

  it("expense row inherits belegFileId from a file-backed submission", async () => {
    const sub = makeSubmission({
      belegFileId: "file-uuid-5678",
      belegVerzichtGrund: null,
    });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieId: "kat-buero",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exp = expensesStore.get(result.expenseId)!;
    expect(exp.belegFileId).toBe("file-uuid-5678");
    expect(exp.belegVerzichtGrund).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A4c: NULL/NULL row → DB raises 23514 → approveSubmission returns 409 not 500
// ---------------------------------------------------------------------------

describe("approveSubmission — NULL/NULL row maps 23514 → 409 (A4)", () => {
  it("returns {ok:false, status:409} when the DB raises a check-violation", async () => {
    const sub = makeSubmission({
      belegFileId: null,
      belegVerzichtGrund: null,
    });

    // Simulate the DB CHECK rejecting the INSERT.
    checkViolationOnNextInsert = true;

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieId: "kat-buero",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toContain("Beleg fehlt");
    // No expense row was created.
    expect(expensesStore.size).toBe(0);
  });
});
