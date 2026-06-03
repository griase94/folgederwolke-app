/**
 * B6 regression: dispatchBeitragsreminder excludes beitrag_exempt members.
 *
 * NOTE: This bug was already fixed in cron-tasks.ts before Phase 0 started
 * (eq(members.beitragExempt, false) is present in the WHERE clause). This
 * test documents the fix and guards against regression.
 *
 * We use the mocked-DB pattern (consistent with cron-tasks.test.ts) to assert
 * that the WHERE predicate includes the exempt filter.
 *
 * @phase-0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    select: mockSelect,
    delete: vi.fn(),
    update: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ yr: 2026 }]),
  }),
}));

vi.mock("$lib/server/mail/index.js", () => ({
  sendMail: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  or: (...args: unknown[]) => ({ op: "or", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  lt: (col: unknown, val: unknown) => ({ op: "lt", col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: "sql",
    strings,
    values,
  }),
}));

vi.mock("$lib/server/db/schema/users.js", () => ({
  magicLinks: { expiresAt: "magic_links.expires_at" },
  sessions: {
    expiresAt: "sessions.expires_at",
    lastUsedAt: "sessions.last_used_at",
  },
  rateLimitAttempts: { occurredAt: "rate_limit_attempts.occurred_at" },
}));
vi.mock("$lib/server/db/schema/invoices.js", () => ({
  invoices: { id: "invoices.id" },
}));
vi.mock("$lib/server/db/schema/members.js", () => ({
  members: {
    id: "members.id",
    vorname: "members.vorname",
    nachname: "members.nachname",
    email: "members.email",
    austrittsDatum: "members.austritts_datum",
    beitragExempt: "members.beitrag_exempt",
  },
  memberBeitrags: {
    memberId: "member_beitrags.member_id",
    year: "member_beitrags.year",
    betragCents: "member_beitrags.betrag_cents",
    paidCents: "member_beitrags.paid_cents",
  },
}));

const { dispatchBeitragsreminder } =
  await import("$lib/server/domain/cron-tasks.js");
const { sendMail } = await import("$lib/server/mail/index.js");

const baseOpts = {
  iban: "DE43830654089999999999",
  bic: "BELADEBEXXX",
  bank: "Berliner Volksbank",
  empfaenger: "Folge der Wolke e.V.",
  year: 2026,
};

beforeEach(() => vi.clearAllMocks());

describe("@phase-0 dispatchBeitragsreminder — B6 exempt filter regression", () => {
  it("WHERE predicate includes beitrag_exempt = false (B6 already fixed)", async () => {
    let capturedWhere: unknown;
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((pred: unknown) => {
        capturedWhere = pred;
        return Promise.resolve([]);
      }),
    };
    mockSelect.mockReturnValue(chain);

    await dispatchBeitragsreminder(baseOpts);

    // The WHERE predicate must be an AND containing eq(beitragExempt, false)
    const pred = capturedWhere as { op: string; args: unknown[] };
    expect(pred.op).toBe("and");

    const exemptFilter = pred.args.find(
      (a): a is { op: string; col: unknown; val: unknown } =>
        typeof a === "object" &&
        a !== null &&
        (a as { op: string }).op === "eq" &&
        (a as { col: unknown }).col === "members.beitrag_exempt" &&
        (a as { val: unknown }).val === false,
    );
    expect(
      exemptFilter,
      "B6: eq(members.beitragExempt, false) must be in WHERE predicate",
    ).toBeDefined();
  });

  it("does not send mail to exempt member (DB excludes them via predicate)", async () => {
    // DB returns empty list — all candidates were exempt
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(chain);

    const result = await dispatchBeitragsreminder(baseOpts);

    expect(result.sent).toBe(0);
    expect(result.checked).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
