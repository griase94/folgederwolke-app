/**
 * B7 regression: dispatchBeitragsreminder uses year-based send_attempt to
 * prevent cross-year deduplication.
 *
 * Bug: cron-tasks.ts calls sendMail() without passing send_attempt, so the
 * default (1) is used every year. After the 2025 reminder, the sent_mails
 * UNIQUE(template, entity_kind, entity_id, send_attempt=1) row already exists,
 * so the 2026 reminder is silently deduped and never sent.
 *
 * Fix: pass send_attempt = year - 2020 (monotonically increasing per year).
 * 2025 → 5, 2026 → 6, 2027 → 7, etc.
 *
 * @phase-0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
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

const mockSendMail = vi.fn();
vi.mock("$lib/server/mail/index.js", () => ({
  sendMail: mockSendMail,
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

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { dispatchBeitragsreminder } =
  await import("$lib/server/domain/cron-tasks.js");

const openRow = {
  memberId: "m-test",
  year: 2026,
  betragCents: BigInt(6969),
  paidCents: BigInt(0),
  vorname: "Test",
  nachname: "Member",
  email: "test@example.com",
};

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("@phase-0 dispatchBeitragsreminder — B7 year-dedup rotation", () => {
  it("passes send_attempt = year - 2020 to sendMail (2026 → 6)", async () => {
    makeSelectChain([{ ...openRow, year: 2026 }]);
    mockSendMail.mockResolvedValue({ messageId: "msg-1", deduped: false });

    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2026,
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const callArgs = mockSendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    // B7 fix: send_attempt should be 2026 - 2020 = 6
    expect(callArgs["send_attempt"]).toBe(6);
  });

  it("passes send_attempt = 5 for year 2025", async () => {
    makeSelectChain([{ ...openRow, year: 2025 }]);
    mockSendMail.mockResolvedValue({ messageId: "msg-2", deduped: false });

    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2025,
    });

    expect(mockSendMail).toHaveBeenCalledOnce();
    const callArgs = mockSendMail.mock.calls[0]?.[0] as Record<string, unknown>;
    // 2025 - 2020 = 5
    expect(callArgs["send_attempt"]).toBe(5);
  });

  it("uses different send_attempt for different years (no cross-year dedup)", async () => {
    // Simulate: 2025 reminder sends with attempt=5
    makeSelectChain([{ ...openRow, year: 2025 }]);
    mockSendMail.mockResolvedValue({ messageId: "msg-3", deduped: false });
    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2025,
    });
    const attempt2025 = (
      mockSendMail.mock.calls[0]?.[0] as Record<string, unknown>
    )["send_attempt"];

    vi.clearAllMocks();

    // 2026 reminder sends with attempt=6 — different from 2025
    makeSelectChain([{ ...openRow, year: 2026 }]);
    mockSendMail.mockResolvedValue({ messageId: "msg-4", deduped: false });
    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2026,
    });
    const attempt2026 = (
      mockSendMail.mock.calls[0]?.[0] as Record<string, unknown>
    )["send_attempt"];

    expect(attempt2025).toBe(5);
    expect(attempt2026).toBe(6);
    expect(attempt2025).not.toBe(attempt2026); // the key assertion
  });
});
