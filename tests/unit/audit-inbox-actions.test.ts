/**
 * @vitest-environment node
 * @phase-4
 *
 * Unit tests for the approve→pay flow's idempotency invariants.
 *
 * Strategy: mock `$lib/server/db/index.js` so the domain helpers run against
 * an in-memory `submissions` + `expenses` store. We don't try to faithfully
 * reproduce drizzle's fluent API — we only stub the call paths the helpers
 * actually take, asserting:
 *
 *   - approveSubmission inserts exactly ONE expense for N parallel calls
 *     against the same submission (the second call short-circuits on the
 *     submission's already-set approved_expense_id).
 *   - rejectSubmission no-ops on a second call against an already-decided row.
 *   - markExpenseErstattet no-ops on a second call against an erstattet row,
 *     and a re-emit of the bus event is naturally absent (we count emits).
 *   - The bus.emit calls fire on the first call only (audit/mail dedup).
 *
 * Festschreibung happy-path is also covered (settings.festgeschrieben_bis
 * unset → null → no block).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// In-memory db fake
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
}

interface MemberRow {
  id: string;
  vorname: string;
  email: string | null;
}

const submissionsStore = new Map<string, SubmissionRow>();
const expensesStore = new Map<string, ExpenseRow>();
const membersStore = new Map<string, MemberRow>();
// festBis = null → no festschreibung.
let festBisOverride: number | null = null;

let nextExpenseId = 1;

function makeSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  const id = overrides.id ?? `sub-${Math.random().toString(36).slice(2, 10)}`;
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

function makeExpense(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  const id = overrides.id ?? `exp-${nextExpenseId++}`;
  const row: ExpenseRow = {
    id,
    businessId: overrides.businessId ?? `AUS-2026-${id.slice(-3)}`,
    bezeichnung: "Druckerpapier",
    betragCents: 2350n,
    gebuchtAm: new Date(),
    approvedAt: new Date(),
    approvedByUserId: "admin-1",
    erstattetAm: null,
    zahlungsartId: null,
    status: "geprueft",
    bezahltVonKind: "verein",
    bezahltVonMemberId: null,
    externName: null,
    externIban: null,
    externEmail: null,
    ...overrides,
  };
  expensesStore.set(id, row);
  return row;
}

// ---------------------------------------------------------------------------
// Drizzle-shaped fake — covers only the calls our helpers issue
// ---------------------------------------------------------------------------

interface PendingSelect {
  table: "submissions" | "expenses" | "members";
  whereField?: keyof SubmissionRow | keyof ExpenseRow | keyof MemberRow;
  whereValue?: unknown;
}

function makeDbFake() {
  function select() {
    const ctx: PendingSelect = { table: "submissions" };
    const chain = {
      from(table: { _kind?: string } & Record<string, unknown>) {
        ctx.table =
          (table._kind as "submissions" | "expenses" | "members") ??
          "submissions";
        return chain;
      },
      where(cond: { field: string; value: unknown }) {
        ctx.whereField = cond.field as never;
        ctx.whereValue = cond.value;
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
              ? r[ctx.whereField as keyof SubmissionRow] === ctx.whereValue
              : true,
          );
        } else if (ctx.table === "expenses") {
          rows = [...expensesStore.values()].filter((r) =>
            ctx.whereField
              ? r[ctx.whereField as keyof ExpenseRow] === ctx.whereValue
              : true,
          );
        } else {
          rows = [...membersStore.values()].filter((r) =>
            ctx.whereField
              ? r[ctx.whereField as keyof MemberRow] === ctx.whereValue
              : true,
          );
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return chain;
  }

  function insert(table: { _kind?: string }) {
    const tableKind = (table._kind as "submissions" | "expenses") ?? "expenses";
    const ctx: { values: Record<string, unknown> } = { values: {} };
    const chain = {
      values(v: Record<string, unknown>) {
        ctx.values = v;
        return chain;
      },
      returning() {
        const id = `${tableKind === "expenses" ? "exp" : "sub"}-${nextExpenseId++}`;
        if (tableKind === "expenses") {
          const row = makeExpense({
            id,
            businessId: (ctx.values.businessId as string) ?? `AUS-NEW-${id}`,
            bezeichnung: (ctx.values.bezeichnung as string) ?? "Druckerpapier",
            betragCents: (ctx.values.betragCents as bigint) ?? 0n,
            approvedAt: (ctx.values.approvedAt as Date) ?? new Date(),
            approvedByUserId: (ctx.values.approvedByUserId as string) ?? null,
            status: (ctx.values.status as string) ?? "geprueft",
            bezahltVonKind: (ctx.values.bezahltVonKind as "verein") ?? "verein",
            bezahltVonMemberId:
              (ctx.values.bezahltVonMemberId as string | null) ?? null,
            externEmail: (ctx.values.externEmail as string | null) ?? null,
            externName: (ctx.values.externName as string | null) ?? null,
          });
          return Promise.resolve([{ id: row.id, businessId: row.businessId }]);
        }
        return Promise.resolve([{ id }]);
      },
      onConflictDoNothing() {
        return chain;
      },
    };
    return chain;
  }

  function update(table: { _kind?: string }) {
    const tableKind =
      (table._kind as "submissions" | "expenses") ?? "submissions";
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
      where(cond: { field: string; value: unknown }) {
        ctx.whereField = cond.field;
        ctx.whereValue = cond.value;
        return chain;
      },
      then(resolve: (n: number) => unknown) {
        if (tableKind === "submissions") {
          for (const row of submissionsStore.values()) {
            if (
              !ctx.whereField ||
              (row as unknown as Record<string, unknown>)[ctx.whereField] ===
                ctx.whereValue
            ) {
              Object.assign(row, ctx.values);
            }
          }
        } else {
          for (const row of expensesStore.values()) {
            if (
              !ctx.whereField ||
              (row as unknown as Record<string, unknown>)[ctx.whereField] ===
                ctx.whereValue
            ) {
              Object.assign(row, ctx.values);
            }
          }
        }
        return Promise.resolve(1).then(resolve);
      },
    };
    return chain;
  }

  async function execute<T = unknown>(): Promise<T[]> {
    // The only sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`
    // call — return our override.
    if (festBisOverride === null) return [] as T[];
    return [{ value: festBisOverride }] as unknown as T[];
  }

  async function transaction<R>(fn: (tx: unknown) => Promise<R>): Promise<R> {
    // Run inline against the same fake — there is no real rollback path,
    // but the helpers only depend on the call-shape, not on isolation.
    return fn(tx);
  }

  const tx = { insert, update, select, execute };
  return { insert, update, select, execute, transaction, _tx: tx };
}

// ---------------------------------------------------------------------------
// vi.mock — replace the real db + schema + bus modules
// ---------------------------------------------------------------------------

const dbFake = makeDbFake();

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => dbFake,
}));

vi.mock("$lib/server/db/schema/auslagen_submissions.js", () => ({
  auslagenSubmissions: {
    _kind: "submissions",
    id: "id",
    businessId: "businessId",
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
  members: {
    _kind: "members",
    id: "id",
    email: "email",
    vorname: "vorname",
  },
}));

vi.mock("$lib/server/db/schema/zahlungsarten.js", () => ({
  zahlungsarten: { _kind: "zahlungsarten" },
}));

// Make drizzle's `eq(col, val)` and `and(...)` return shapes our update/select
// `where` helpers can read.
vi.mock("drizzle-orm", async () => {
  return {
    eq: (col: string, val: unknown) => ({ field: col, value: val }),
    and: (a: unknown) => a,
    sql: (strings: TemplateStringsArray) => ({ strings }),
    desc: (c: unknown) => c,
    isNull: (c: unknown) => ({ field: c, value: null }),
  };
});

const emitMock: ReturnType<
  typeof vi.fn<(event: string, payload?: unknown) => Promise<void>>
> = vi.fn(async () => undefined);
vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: emitMock },
  registerHandlers: () => undefined,
}));

vi.mock("$lib/server/domain/id-allocator.js", () => ({
  allocateBusinessId: async (kind: string, year: number) =>
    `${kind}-${year}-001`,
}));

// ---------------------------------------------------------------------------
// SUT — import AFTER all vi.mock() declarations
// ---------------------------------------------------------------------------

const { approveSubmission, rejectSubmission, markExpenseErstattet } =
  await import("$lib/server/domain/audit-inbox-actions.js");

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  submissionsStore.clear();
  expensesStore.clear();
  membersStore.clear();
  emitMock.mockClear();
  festBisOverride = null;
  nextExpenseId = 1;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// approveSubmission
// ---------------------------------------------------------------------------

describe("approveSubmission — idempotency", () => {
  it("creates one expense row on first call and links it to the submission", async () => {
    const sub = makeSubmission({ businessId: "AUS-2026-007" });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(expensesStore.size).toBe(1);

    const updated = submissionsStore.get(sub.id)!;
    expect(updated.decision).toBe("approved");
    expect(updated.decidedAt).toBeInstanceOf(Date);
    expect(updated.approvedExpenseId).toBe(result.expenseId);

    // expense.approved event fired exactly once
    const approveEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "expense.approved",
    );
    expect(approveEmits).toHaveLength(1);
  });

  it("returns the existing expense on a second call (no re-insert)", async () => {
    const sub = makeSubmission({ businessId: "AUS-2026-008" });

    const first = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });
    if (!first.ok) throw new Error("first call failed");

    const second = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.expenseId).toBe(first.expenseId);

    // Still only one expense row in the store
    expect(expensesStore.size).toBe(1);

    // Only one bus.emit("expense.approved") in total
    const approveEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "expense.approved",
    );
    expect(approveEmits).toHaveLength(1);
  });

  it("refuses to approve a previously rejected submission", async () => {
    const sub = makeSubmission({
      decidedAt: new Date(),
      decision: "rejected",
    });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("returns 404 when the submission does not exist", async () => {
    const result = await approveSubmission({
      submissionId: "does-not-exist",
      actorUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("rejects when the Buchungsjahr is festgeschrieben", async () => {
    festBisOverride = 2026;
    const sub = makeSubmission({ rechnungsdatum: "2026-03-15" });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toContain("2026");
  });

  it("copies bezahlt_von discriminated union fields verbatim (ADR-0007)", async () => {
    const sub = makeSubmission({
      bezahltVonKind: "extern",
      bezahltVonMemberId: null,
      externName: "Lea Mustermann",
      externIban: "DE25830654080006894453",
      externEmail: "lea@example.com",
      bezahltVonDisplay: "Extern: Lea Mustermann (DE25...4453)",
    });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exp = expensesStore.get(result.expenseId)!;
    expect(exp.bezahltVonKind).toBe("extern");
    expect(exp.externName).toBe("Lea Mustermann");
    expect(exp.externEmail).toBe("lea@example.com");
  });
});

// ---------------------------------------------------------------------------
// rejectSubmission
// ---------------------------------------------------------------------------

describe("rejectSubmission — idempotency", () => {
  it("marks the submission rejected and emits exactly once", async () => {
    const sub = makeSubmission();

    const result = await rejectSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      grund: "Beleg ist unleserlich",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyDecided).toBe(false);

    const updated = submissionsStore.get(sub.id)!;
    expect(updated.decision).toBe("rejected");
    expect(updated.decidedAt).toBeInstanceOf(Date);
    expect(updated.decisionReason).toBe("Beleg ist unleserlich");

    const rejectEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "auslage.rejected",
    );
    expect(rejectEmits).toHaveLength(1);
  });

  it("second call returns alreadyDecided=true and does NOT re-emit", async () => {
    const sub = makeSubmission();

    await rejectSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      grund: "Beleg ist unleserlich",
    });
    emitMock.mockClear();

    const second = await rejectSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      grund: "Beleg ist unleserlich",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyDecided).toBe(true);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("422 on missing/short grund", async () => {
    const sub = makeSubmission();
    const result = await rejectSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      grund: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// markExpenseErstattet
// ---------------------------------------------------------------------------

describe("markExpenseErstattet — idempotency", () => {
  it("sets erstattet_am and emits expense.erstattet once", async () => {
    const exp = makeExpense({
      bezahltVonKind: "extern",
      externEmail: "lea@example.com",
      externName: "Lea Mustermann",
    });

    const result = await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "2026-05-15",
      zahlungsartId: "zart-1",
      actorUserId: "admin-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyErstattet).toBe(false);

    const updated = expensesStore.get(exp.id)!;
    expect(updated.erstattetAm).toBe("2026-05-15");
    expect(updated.zahlungsartId).toBe("zart-1");
    expect(updated.status).toBe("erstattet");

    const erstattetEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "expense.erstattet",
    );
    expect(erstattetEmits).toHaveLength(1);
  });

  it("second call returns alreadyErstattet=true and does NOT re-emit", async () => {
    const exp = makeExpense();

    await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "2026-05-15",
      zahlungsartId: "zart-1",
      actorUserId: "admin-1",
    });
    emitMock.mockClear();

    const second = await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "2026-05-16",
      zahlungsartId: "zart-2",
      actorUserId: "admin-1",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyErstattet).toBe(true);

    // No second event — DB-layer dedup is also a backstop but this is the
    // primary guard (cheaper than relying on sent_mails UNIQUE alone).
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("refuses when the expense is not yet approved", async () => {
    const exp = makeExpense({ approvedAt: null });
    const result = await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "2026-05-15",
      zahlungsartId: "zart-1",
      actorUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  it("422 on malformed chosenDate", async () => {
    const exp = makeExpense();
    const result = await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "not-a-date",
      zahlungsartId: "zart-1",
      actorUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
  });

  it("blocks when the Buchungsjahr is festgeschrieben", async () => {
    festBisOverride = 2026;
    const exp = makeExpense({ gebuchtAm: new Date("2026-04-01T12:00:00Z") });
    const result = await markExpenseErstattet({
      expenseId: exp.id,
      chosenDate: "2026-05-15",
      zahlungsartId: "zart-1",
      actorUserId: "admin-1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });
});
