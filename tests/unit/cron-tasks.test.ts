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

vi.mock("$lib/server/files/drive-impl.js", () => ({
  driveFileStorage: {
    upload: vi.fn(),
  },
}));

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
await import("$lib/server/files/drive-impl.js");

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

  it("counts succeeded and failed uploads", async () => {
    const rows = [
      { id: "id-1", businessId: "R-2026-001", pdfBytes: Buffer.from("pdf1") },
      { id: "id-2", businessId: "R-2026-002", pdfBytes: Buffer.from("pdf2") },
      { id: "id-3", businessId: "R-2026-003", pdfBytes: Buffer.from("pdf3") },
    ];

    // select chain
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    mockSelect.mockReturnValue(selectChain);

    // update chain
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };
    mockUpdate.mockReturnValue(updateChain);

    const mockStorage = {
      upload: vi
        .fn()
        .mockResolvedValueOnce({ id: "drive-1", viewUrl: "http://drive/1" })
        .mockRejectedValueOnce(new Error("Drive quota"))
        .mockResolvedValueOnce({ id: "drive-3", viewUrl: "http://drive/3" }),
      download: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
    };

    const result = await retryFailedDriveUploads(mockStorage);
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
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
});
