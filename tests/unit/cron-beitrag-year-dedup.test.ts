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

// C2: the cron emits `beitrag.reminder_requested` on the bus (no inline sendMail).
const mockEmit = vi.fn().mockResolvedValue(undefined);
vi.mock("$lib/server/events/index.js", () => ({
  bus: { emit: mockEmit },
  registerHandlers: () => undefined,
}));

// Isolate the DB-backed reminder helpers so this unit test exercises only the
// cron's selection + the jahresbasierte send_attempt (the real formula is pinned
// separately by beitrag-reminder-send-attempt.test + the integration test).
vi.mock("$lib/server/domain/beitrag-reminder.js", () => ({
  reminderSendAttempt: (y: number) => y - 2020,
  remindedMemberIdsForYear: vi.fn().mockResolvedValue(new Set<string>()),
  resolveReminderFrist: vi.fn().mockResolvedValue(null),
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

function attemptOf(call: number): unknown {
  return (mockEmit.mock.calls[call]?.[1] as Record<string, unknown>)[
    "sendAttempt"
  ];
}

describe("@phase-0 dispatchBeitragsreminder — B7 year-dedup rotation", () => {
  it("emits with sendAttempt = year - 2020 (2026 → 6)", async () => {
    makeSelectChain([{ ...openRow, year: 2026 }]);

    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2026,
    });

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit.mock.calls[0]?.[0]).toBe("beitrag.reminder_requested");
    expect(attemptOf(0)).toBe(6);
  });

  it("emits with sendAttempt = 5 for year 2025", async () => {
    makeSelectChain([{ ...openRow, year: 2025 }]);

    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2025,
    });

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(attemptOf(0)).toBe(5);
  });

  it("uses different sendAttempt for different years (no cross-year dedup)", async () => {
    makeSelectChain([{ ...openRow, year: 2025 }]);
    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2025,
    });
    const attempt2025 = attemptOf(0);

    vi.clearAllMocks();

    makeSelectChain([{ ...openRow, year: 2026 }]);
    await dispatchBeitragsreminder({
      iban: "DE43830654089999999999",
      bic: "BELADEBEXXX",
      bank: "Berliner Volksbank",
      empfaenger: "Folge der Wolke e.V.",
      year: 2026,
    });
    const attempt2026 = attemptOf(0);

    expect(attempt2025).toBe(5);
    expect(attempt2026).toBe(6);
    expect(attempt2025).not.toBe(attempt2026); // the key assertion
  });
});
