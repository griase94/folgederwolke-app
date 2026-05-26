/**
 * Exempt-member filter for dispatchBeitragsreminder — Blocker A cycle-2 fix.
 * @phase-6
 *
 * Verifies that members with `beitrag_exempt = true` are excluded from the
 * bulk-reminder candidate query and never receive "Sie schulden €X" mails,
 * even when they have synthetic unpaid Beitrag rows.
 *
 * All DB calls are mocked (no real Postgres connection required).
 * The DB mock captures the Drizzle WHERE predicate so we can assert that
 * `eq(members.beitragExempt, false)` is present in the composed condition.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB module
// ---------------------------------------------------------------------------

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

// Drizzle operator pass-through stubs — preserve args so we can inspect them.
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

// Schema stubs — include beitragExempt so the predicate reference resolves.
vi.mock("$lib/server/db/schema/users.js", () => ({
  magicLinks: { expiresAt: "magic_links.expires_at" },
  sessions: {
    expiresAt: "sessions.expires_at",
    lastUsedAt: "sessions.last_used_at",
  },
  rateLimitAttempts: { occurredAt: "rate_limit_attempts.occurred_at" },
}));
vi.mock("$lib/server/db/schema/invoices.js", () => ({
  invoices: {
    driveStatus: "invoices.drive_status",
    pdfBytes: "invoices.pdf_bytes",
    id: "invoices.id",
    businessId: "invoices.business_id",
  },
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

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { dispatchBeitragsreminder } =
  await import("$lib/server/domain/cron-tasks.js");
const { sendMail } = await import("$lib/server/mail/index.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the Drizzle builder chain mock and capture the WHERE predicate passed
 * to `.where(...)` so tests can inspect it.
 */
function makeSelectChain(rows: unknown[]) {
  let capturedWhere: unknown = undefined;
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation((predicate: unknown) => {
      capturedWhere = predicate;
      return Promise.resolve(rows);
    }),
  };
  mockSelect.mockReturnValue(chain);
  return {
    chain,
    getCapturedWhere: () => capturedWhere,
  };
}

const baseOpts = {
  iban: "DE43830654089999999999",
  bic: "BELADEBEXXX",
  bank: "Berliner Volksbank",
  empfaenger: "Folge der Wolke e.V.",
  year: 2026,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatchBeitragsreminder — exempt-member filter (Blocker A)", () => {
  /**
   * Scenario:
   *   m1 — active, unpaid beitrag → should be in candidate list
   *   m2 — exempt, unpaid beitrag → should NOT be in candidate list (filtered by DB)
   *   m3 — Austritt (left), unpaid beitrag → should NOT be in candidate list (filtered by DB)
   *
   * The DB mock returns only m1 (simulating the combined WHERE predicate
   * correctly excluding m2 and m3). The test asserts:
   *   1. The WHERE predicate contains `eq(members.beitragExempt, false)`.
   *   2. Only m1 receives a mail.
   */
  it("WHERE predicate includes beitrag_exempt = false filter", async () => {
    // Only m1 survives the DB filter.
    const { getCapturedWhere } = makeSelectChain([
      {
        memberId: "m1",
        year: 2026,
        betragCents: BigInt(6000),
        paidCents: BigInt(0),
        vorname: "Anna",
        nachname: "Aktiv",
        email: "anna@example.com",
      },
    ]);

    vi.mocked(sendMail).mockResolvedValue({
      messageId: "msg-anna",
      deduped: false,
    });

    await dispatchBeitragsreminder(baseOpts);

    // Inspect the WHERE predicate that was passed to the Drizzle builder.
    const predicate = getCapturedWhere() as {
      op: string;
      args: unknown[];
    } | null;

    expect(predicate).not.toBeNull();
    expect(predicate?.op).toBe("and");

    // The `and(...)` args should contain an `eq` node for beitrag_exempt = false.
    const args = predicate?.args ?? [];
    const exemptFilter = args.find(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        (a as { op: string; col: unknown; val: unknown }).op === "eq" &&
        (a as { op: string; col: unknown; val: unknown }).col ===
          "members.beitrag_exempt" &&
        (a as { op: string; col: unknown; val: unknown }).val === false,
    );

    expect(
      exemptFilter,
      "Expected eq(members.beitragExempt, false) in WHERE predicate — exempt members must be excluded from bulk-reminder candidates",
    ).toBeDefined();
  });

  it("sends mail only to non-exempt candidate (m1), not exempt (m2) or Austritt (m3)", async () => {
    // DB returns only m1 after applying all WHERE predicates (exempt + Austritt filtered out).
    makeSelectChain([
      {
        memberId: "m1",
        year: 2026,
        betragCents: BigInt(6000),
        paidCents: BigInt(0),
        vorname: "Anna",
        nachname: "Aktiv",
        email: "anna@example.com",
      },
    ]);

    vi.mocked(sendMail).mockResolvedValue({
      messageId: "msg-anna",
      deduped: false,
    });

    const result = await dispatchBeitragsreminder(baseOpts);

    // Exactly one candidate checked, one mail sent.
    expect(result.checked).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // sendMail called once, only for m1.
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: "m1", to: "anna@example.com" }),
    );
  });

  it("sends zero mails when only exempt members have open beitrags", async () => {
    // DB returns empty — all candidates were exempt and filtered out.
    makeSelectChain([]);

    const result = await dispatchBeitragsreminder(baseOpts);

    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, errors: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
