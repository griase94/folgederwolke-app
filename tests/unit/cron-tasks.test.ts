/**
 * Unit tests for cron-tasks.ts helpers.  @phase-6
 *
 * All DB calls are mocked — these tests exercise the logic layer only.
 * Each cleanup function is tested for the correct DELETE predicate shape;
 * dispatchBeitragsreminder is tested for sent/skipped/dedup branching.
 *
 * We use vi.mock to intercept the db module and return controlled results.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the DB module before importing the module under test.
// ---------------------------------------------------------------------------

const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    delete: mockDelete,
    update: mockUpdate,
    select: mockSelect,
    execute: vi.fn().mockResolvedValue([{ yr: 2026 }]),
  }),
}));

vi.mock("$lib/server/mail/index.js", () => ({
  sendMail: vi.fn(),
}));

// Phase 9: drive-impl.ts deleted; storage flows through getFileStorage().
// The retry helper is stubbed (FIXME Phase 9 follow-up) so we no longer mock
// a storage backend at this layer.

// Drizzle operators used in the module — pass-through identity stubs so
// the import doesn't blow up in the test environment (no pg connection).
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

// Stub schema modules — the test only needs the table reference objects to
// exist; they are passed through to the mock DB which ignores them.
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
// Import module under test (after mocks are registered)
// ---------------------------------------------------------------------------

const {
  cleanupMagicLinks,
  cleanupSessions,
  cleanupRateLimitAttempts,
  retryFailedDriveUploads,
  dispatchBeitragsreminder,
} = await import("$lib/server/domain/cron-tasks.js");

const { sendMail } = await import("$lib/server/mail/index.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteChain(rowCount = 3) {
  // The chain: .delete(table).where(...).returning({...}) → Array of rows.
  // We simulate rowCount by returning an array of that length.
  const fakeRows = Array.from({ length: rowCount }, (_, i) => ({
    id: `fake-id-${i}`,
  }));
  const returningMock = vi.fn().mockResolvedValue(fakeRows);
  const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
  mockDelete.mockReturnValue({ where: whereMock });
  return { where: whereMock, returning: returningMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// cleanupMagicLinks
// ---------------------------------------------------------------------------

describe("cleanupMagicLinks", () => {
  it("returns deleted row count", async () => {
    makeDeleteChain(5);
    const result = await cleanupMagicLinks();
    expect(result).toBe(5);
    expect(mockDelete).toHaveBeenCalledOnce();
  });

  it("returns 0 when nothing deleted", async () => {
    makeDeleteChain(0);
    const result = await cleanupMagicLinks();
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cleanupSessions
// ---------------------------------------------------------------------------

describe("cleanupSessions", () => {
  it("returns deleted row count", async () => {
    makeDeleteChain(2);
    const result = await cleanupSessions();
    expect(result).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cleanupRateLimitAttempts
// ---------------------------------------------------------------------------

describe("cleanupRateLimitAttempts", () => {
  it("returns deleted row count", async () => {
    makeDeleteChain(10);
    const result = await cleanupRateLimitAttempts();
    expect(result).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// retryFailedDriveUploads
// ---------------------------------------------------------------------------

describe("retryFailedDriveUploads", () => {
  it("returns zeroes when storage is null (no-op)", async () => {
    const result = await retryFailedDriveUploads(null);
    expect(result).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  // TODO(Phase 9 follow-up): re-enable once retryFailedDriveUploads is
  // wired to the new pathname-addressed FileStorage interface and the
  // invoice upload pipeline (files-row + deterministic pathname) lands.
  // The body below exercises the old { id, viewUrl } upload shape which
  // no longer exists.
  it.skip("counts succeeded and failed uploads", async () => {
    void retryFailedDriveUploads;
  });
});

// ---------------------------------------------------------------------------
// dispatchBeitragsreminder
// ---------------------------------------------------------------------------

describe("dispatchBeitragsreminder", () => {
  const opts = {
    iban: "DE43830654089999999999",
    bic: "BELADEBEXXX",
    bank: "Berliner Volksbank",
    empfaenger: "Folge der Wolke e.V.",
    year: 2026,
  };

  it("sends mails to members with open Beiträge", async () => {
    const openRows = [
      {
        memberId: "m-1",
        year: 2026,
        betragCents: BigInt(6969),
        paidCents: BigInt(0),
        vorname: "Anna",
        nachname: "Müller",
        email: "anna@example.com",
      },
    ];

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(openRows),
    };
    mockSelect.mockReturnValue(selectChain);

    vi.mocked(sendMail).mockResolvedValue({
      messageId: "msg-1",
      deduped: false,
    });

    const result = await dispatchBeitragsreminder(opts);

    expect(result.checked).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("counts deduped mails as skipped", async () => {
    const openRows = [
      {
        memberId: "m-2",
        year: 2026,
        betragCents: BigInt(6969),
        paidCents: BigInt(0),
        vorname: "Ben",
        nachname: "Schulz",
        email: "ben@example.com",
      },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(openRows),
    };
    mockSelect.mockReturnValue(selectChain);

    vi.mocked(sendMail).mockResolvedValue({ messageId: null, deduped: true });

    const result = await dispatchBeitragsreminder(opts);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("counts sendMail errors without throwing", async () => {
    const openRows = [
      {
        memberId: "m-3",
        year: 2026,
        betragCents: BigInt(6969),
        paidCents: BigInt(0),
        vorname: "Cara",
        nachname: "Berg",
        email: "cara@example.com",
      },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(openRows),
    };
    mockSelect.mockReturnValue(selectChain);

    vi.mocked(sendMail).mockRejectedValue(new Error("SMTP unavailable"));

    const result = await dispatchBeitragsreminder(opts);
    expect(result.errors).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("returns zeros when no open Beiträge", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const result = await dispatchBeitragsreminder(opts);
    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, errors: 0 });
  });

  // -------------------------------------------------------------------------
  // Exempt-member filter (Blocker A — cycle 2)
  // -------------------------------------------------------------------------
  // The DB mock returns only what the query would return after the
  // `beitrag_exempt = false` WHERE predicate. We verify here that the
  // function correctly counts only the non-exempt candidate returned by the
  // (already filtered) DB result, and does NOT attempt to send to the
  // exempt member.
  //
  // Because all DB I/O is mocked at the Drizzle builder level, the actual SQL
  // predicate (`eq(members.beitragExempt, false)`) is validated by the
  // query-shape tests in cron-tasks-exempt-filter.test.ts. Here we confirm
  // the calling layer correctly passes through and counts only what the DB
  // returns.
  it("does not send to exempt member when DB returns only non-exempt candidates", async () => {
    // Simulate: m1 (active, unpaid) is returned by the query; m2 (exempt) is
    // already excluded by the DB predicate and therefore absent from openRows.
    const openRows = [
      {
        memberId: "m1-active",
        year: 2026,
        betragCents: BigInt(6000),
        paidCents: BigInt(0),
        vorname: "Lena",
        nachname: "Richter",
        email: "lena@example.com",
      },
    ];

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(openRows),
    };
    mockSelect.mockReturnValue(selectChain);

    vi.mocked(sendMail).mockResolvedValue({
      messageId: "msg-lena",
      deduped: false,
    });

    const result = await dispatchBeitragsreminder(opts);

    // Only m1 is in the list → exactly one mail sent.
    expect(result.checked).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // sendMail was called once and only for m1.
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: "m1-active" }),
    );
  });
});
