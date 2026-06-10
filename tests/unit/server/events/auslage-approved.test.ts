// @vitest-environment node
/**
 * @phase-9
 *
 * Unit tests for the auslage.approved event pathway.
 *
 * Strategy:
 *   - approveSubmission emits "auslage.approved" with the correct payload
 *     (including send_attempt computed from existing sent_mails rows).
 *   - The event handler calls sendMail with template='auslage_approved' and
 *     the correct idempotency fields.
 *   - Re-approve-after-reject increments send_attempt so ADR-0005's UNIQUE
 *     constraint (template, entity_kind, entity_id, send_attempt) allows a
 *     new row rather than silently deduping (P2-B6 fix).
 *
 * Uses vi.mock() for DB + bus + sendMail — keeps the test hermetic and fast
 * without a real Postgres round-trip.
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

interface SentMailRow {
  id: string;
  template: string;
  entityKind: string;
  entityId: string;
  sendAttempt: number;
}

const submissionsStore = new Map<string, SubmissionRow>();
const expensesStore = new Map<string, ExpenseRow>();
// approveSubmission resolves the chosen Kategorie by name (gate, spec §4.6).
const kategorienStore = new Map<
  string,
  { id: string; kind: string; name: string; sphere: string }
>();
let nextExpenseId = 1;

// Tracks sent_mails rows for idempotency count (P2-B6)
const sentMailsStore: SentMailRow[] = [];

// festBis = null → no festschreibung block
let festBisOverride: number | null = null;

function makeSubmission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  const id = overrides.id ?? `sub-${Math.random().toString(36).slice(2, 10)}`;
  const row: SubmissionRow = {
    id,
    businessId: overrides.businessId ?? `AUS-2026-${id.slice(-3)}`,
    bezeichnung: "Druckerpapier",
    kommentar: null,
    rechnungsdatum: "2026-05-01",
    betragCents: 1599n,
    currency: "EUR",
    bezahltVonKind: "member",
    bezahltVonMemberId: "mem-1",
    externName: null,
    externIban: null,
    externEmail: null,
    bezahltVonDisplay: "Max Mustermann",
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
    betragCents: 1599n,
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
// Drizzle-shaped fake DB — covers calls made by approveSubmission + handler
// ---------------------------------------------------------------------------

function makeDbFake() {
  function select() {
    const ctx: {
      table: string;
      whereField?: string;
      whereValue?: unknown;
      _isCount?: boolean;
    } = { table: "submissions" };
    const chain = {
      from(table: { _kind?: string }) {
        ctx.table = table._kind ?? "submissions";
        return chain;
      },
      where(cond: { field?: string; value?: unknown }) {
        if (cond?.field) {
          ctx.whereField = cond.field;
          ctx.whereValue = cond.value;
        }
        return chain;
      },
      limit() {
        return chain;
      },
      orderBy() {
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown) {
        let rows: unknown[] = [];
        if (ctx.table === "submissions") {
          rows = [...submissionsStore.values()].filter((r) =>
            ctx.whereField
              ? (r as unknown as Record<string, unknown>)[ctx.whereField!] ===
                ctx.whereValue
              : true,
          );
        } else if (ctx.table === "expenses") {
          rows = [...expensesStore.values()].filter((r) =>
            ctx.whereField
              ? (r as unknown as Record<string, unknown>)[ctx.whereField!] ===
                ctx.whereValue
              : true,
          );
        } else if (ctx.table === "members") {
          // Return a fake member for mem-1
          if (ctx.whereValue === "mem-1") {
            rows = [{ email: "m@example.org", vorname: "Max" }];
          }
        } else if (ctx.table === "sentMails") {
          // For the send_attempt count query
          const filtered = sentMailsStore.filter((r) => {
            if (ctx.whereField === "entityId" && r.entityId !== ctx.whereValue)
              return false;
            return true;
          });
          // Return count-shaped object
          rows = [
            {
              n: filtered.filter((r) => r.template === "auslage_approved")
                .length,
            },
          ];
        } else if (ctx.table === "kategorien") {
          // resolveKategorieByName does where(and(eq(kind,…), eq(name,…)));
          // the `and:(a)=>a` mock collapses to the kind eq, so filter by the
          // single where field → the one seeded expense kategorie.
          rows = [...kategorienStore.values()].filter((r) =>
            ctx.whereField
              ? (r as Record<string, unknown>)[ctx.whereField!] ===
                ctx.whereValue
              : true,
          );
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
          const candidateBusinessId =
            (ctx.values.businessId as string) ?? `AUS-NEW-${nextExpenseId}`;
          const existing = [...expensesStore.values()].find(
            (r) => r.businessId === candidateBusinessId,
          );
          if (existing) {
            const err = Object.assign(
              new Error("duplicate key value violates unique constraint"),
              { code: "23505" },
            );
            return Promise.reject(err);
          }
          const id = `exp-${nextExpenseId++}`;
          const row = makeExpense({
            id,
            businessId: candidateBusinessId,
            bezeichnung: (ctx.values.bezeichnung as string) ?? "Druckerpapier",
            betragCents: (ctx.values.betragCents as bigint) ?? 0n,
            approvedAt: (ctx.values.approvedAt as Date) ?? new Date(),
            approvedByUserId: (ctx.values.approvedByUserId as string) ?? null,
            status: (ctx.values.status as string) ?? "geprueft",
            bezahltVonKind: (ctx.values.bezahltVonKind as "verein") ?? "verein",
            bezahltVonMemberId:
              (ctx.values.bezahltVonMemberId as string | null) ?? null,
          });
          return Promise.resolve([{ id: row.id, businessId: row.businessId }]);
        }
        return Promise.resolve([{ id: `sub-new-${nextExpenseId++}` }]);
      },
      onConflictDoNothing() {
        return chain;
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
      where(cond: unknown) {
        const c = cond as { field?: string; value?: unknown };
        if (c?.field) {
          ctx.whereField = c.field;
          ctx.whereValue = c.value;
        }
        return chain;
      },
      returning() {
        const changed: Array<{ id: string }> = [];
        const store =
          tableKind === "submissions" ? submissionsStore : expensesStore;
        for (const row of store.values()) {
          const r = row as unknown as Record<string, unknown>;
          if (ctx.whereField && r[ctx.whereField] !== ctx.whereValue) continue;
          if (
            "decidedAt" in ctx.values &&
            tableKind === "submissions" &&
            (r as { decidedAt: Date | null }).decidedAt !== null
          ) {
            continue;
          }
          Object.assign(row, ctx.values);
          changed.push({ id: r.id as string });
        }
        return Promise.resolve(changed);
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

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

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
  members: { _kind: "members", id: "id", email: "email", vorname: "vorname" },
}));

vi.mock("$lib/server/db/schema/mails.js", () => ({
  sentMails: {
    _kind: "sentMails",
    template: "template",
    entityKind: "entityKind",
    entityId: "entityId",
    sendAttempt: "sendAttempt",
  },
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
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
  desc: (c: unknown) => c,
  isNull: (c: unknown) => ({ field: c, value: null }),
}));

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
// SUT — import AFTER vi.mock
// ---------------------------------------------------------------------------

const { approveSubmission } =
  await import("$lib/server/domain/audit-inbox-actions.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  submissionsStore.clear();
  expensesStore.clear();
  kategorienStore.clear();
  kategorienStore.set("kat-buero", {
    id: "kat-buero",
    kind: "expense",
    name: "Bürobedarf",
    sphere: "wirtschaftlich",
  });
  sentMailsStore.length = 0;
  emitMock.mockClear();
  festBisOverride = null;
  nextExpenseId = 1;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("approveSubmission → auslage.approved event", () => {
  it("emits auslage.approved with send_attempt=0 on first approval", async () => {
    const sub = makeSubmission({ businessId: "AUS-2026-007" });

    const result = await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieName: "Bürobedarf",
    });

    expect(result.ok).toBe(true);

    const approvedEmits = emitMock.mock.calls.filter(
      (c) => c[0] === "auslage.approved",
    );
    expect(approvedEmits).toHaveLength(1);

    const payload = approvedEmits[0]![1] as Record<string, unknown>;
    expect(payload.submissionId).toBe(sub.id);
    expect(payload.submissionBusinessId).toBe("AUS-2026-007");
    expect(payload.send_attempt).toBe(0);
    expect(payload.betragCents).toBe(1599);
    expect(payload.bezeichnung).toBe("Druckerpapier");
  });

  it("is idempotent — second call short-circuits before emitting auslage.approved", async () => {
    const sub = makeSubmission({ businessId: "AUS-2026-008" });

    await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieName: "Bürobedarf",
    });
    const firstCount = emitMock.mock.calls.filter(
      (c) => c[0] === "auslage.approved",
    ).length;
    expect(firstCount).toBe(1);

    emitMock.mockClear();

    // Second call — submission now has approvedExpenseId set → short-circuit
    await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieName: "Bürobedarf",
    });

    const secondCount = emitMock.mock.calls.filter(
      (c) => c[0] === "auslage.approved",
    ).length;
    expect(secondCount).toBe(0);
  });

  it("re-approve-after-reject increments send_attempt (P2-B6)", async () => {
    const sub = makeSubmission({ businessId: "AUS-2026-009" });

    // First approval → auslage.approved with send_attempt=0
    await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieName: "Bürobedarf",
    });
    const firstPayload = emitMock.mock.calls.find(
      (c) => c[0] === "auslage.approved",
    )![1] as Record<string, unknown>;
    expect(firstPayload.send_attempt).toBe(0);

    // Simulate: a sent_mails row was written for the first approval
    sentMailsStore.push({
      id: "sm-1",
      template: "auslage_approved",
      entityKind: "auslagen_submission",
      entityId: sub.id,
      sendAttempt: 0,
    });

    // Reset for second cycle: undo the decided state to allow re-approve
    const subRow = submissionsStore.get(sub.id)!;
    Object.assign(subRow, {
      decidedAt: null,
      decision: null,
      decidedByUserId: null,
      approvedExpenseId: null,
    });
    // Remove the expense so INSERT doesn't hit unique violation
    expensesStore.clear();
    emitMock.mockClear();

    // Second approval (after manual reset, simulating re-approve-after-reject)
    await approveSubmission({
      submissionId: sub.id,
      actorUserId: "admin-1",
      kategorieName: "Bürobedarf",
    });
    const secondPayload = emitMock.mock.calls.find(
      (c) => c[0] === "auslage.approved",
    )![1] as Record<string, unknown>;
    // send_attempt should be 1 (one existing row in sentMailsStore)
    expect(secondPayload.send_attempt).toBe(1);
  });
});
