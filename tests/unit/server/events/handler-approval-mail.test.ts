// @vitest-environment node
/**
 * @phase-9
 *
 * Unit test for the auslage.approved → ApprovalMail handler wiring.
 *
 * Strategy:
 *   - Mock sendMail so we can observe its calls.
 *   - Register handlers, emit auslage.approved on the real bus, assert
 *     sendMail was called with template='auslage_approved' + the correct
 *     idempotency fields (entity_kind, entity_id, send_attempt).
 *   - Verify the handler skips when submitterEmail is null (no recipient).
 *
 * The sent_mails idempotency row itself is owned by sendMail() (ADR-0005);
 * its DB-level UNIQUE is tested elsewhere. This test only proves the bus
 * handler dispatches to the canonical sendMail rather than calling the
 * provider directly (CLAUDE.md §2 event-bus discipline).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks: capture sendMail calls.
// ---------------------------------------------------------------------------

const sendMailMock: ReturnType<
  typeof vi.fn<
    (opts: Record<string, unknown>) => Promise<{
      messageId: string | null;
      deduped: boolean;
    }>
  >
> = vi.fn(async () => ({ messageId: null, deduped: false }));
vi.mock("$lib/server/mail/index.js", () => ({
  sendMail: sendMailMock,
}));

// Stub logAudit so audit_log writes don't reach a real DB.
const logAuditMock = vi.fn(async () => undefined);
vi.mock("$lib/server/audit-log/index.js", () => ({
  logAudit: logAuditMock,
}));

// Stub getDb / auslagenSubmissions for the auslage.reviewed handler that's
// also registered by registerHandlers() (we don't emit reviewed here, but the
// import graph touches the module).
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
}));

vi.mock("$lib/server/db/schema/auslagen_submissions.js", () => ({
  auslagenSubmissions: {
    _kind: "submissions",
    id: "id",
    reviewedAt: "reviewedAt",
  },
}));

vi.mock("drizzle-orm", async () => ({
  eq: (col: string, val: unknown) => ({ field: col, value: val }),
  and: (a: unknown) => a,
  isNull: (c: unknown) => ({ field: c, value: null }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
  desc: (c: unknown) => c,
}));

// ---------------------------------------------------------------------------
// SUT — import bus + registerHandlers AFTER mocks
// ---------------------------------------------------------------------------

const { bus } = await import("$lib/server/events/index.js");
const { registerHandlers } = await import("$lib/server/events/handlers.js");

// Register exactly once for the entire file — registerHandlers() is idempotent
// at the registration-guard level. Re-running it in beforeEach() would attach
// duplicate listeners to the bus singleton across tests (bus.on adds to a Set,
// but Set membership is by function identity and each call creates fresh
// closures), causing sendMail to fire N times per emit. One register here is
// enough for all tests in this file.
registerHandlers();

beforeEach(() => {
  sendMailMock.mockClear();
  logAuditMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auslage.approved handler → ApprovalMail dispatch", () => {
  it("calls sendMail with template='auslage_approved' and correct idempotency keys", async () => {
    await bus.emit("auslage.approved", {
      submissionId: "sub-007",
      submissionBusinessId: "AUS-2026-007",
      submitterEmail: "max@example.org",
      vorname: "Max",
      bezeichnung: "Druckerpapier",
      betragCents: 1599,
      kategorie: "Büromaterial",
      decidedAt: "2026-05-22T03:00:00+02:00",
      decidedByUserId: "admin-1",
      send_attempt: 0,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.template).toBe("auslage_approved");
    expect(call.entity_kind).toBe("auslagen_submission");
    expect(call.entity_id).toBe("sub-007");
    expect(call.send_attempt).toBe(0);
    expect(call.to).toBe("max@example.org");
    const props = call.props as Record<string, unknown>;
    expect(props.vorname).toBe("Max");
    expect(props.ausId).toBe("AUS-2026-007");
    expect(props.bezeichnung).toBe("Druckerpapier");
    expect(props.betragCents).toBe(1599);
    expect(props.kategorie).toBe("Büromaterial");
  });

  it("forwards send_attempt for re-approve-after-reject (P2-B6)", async () => {
    await bus.emit("auslage.approved", {
      submissionId: "sub-008",
      submissionBusinessId: "AUS-2026-008",
      submitterEmail: "max@example.org",
      vorname: "Max",
      bezeichnung: "Druckerpapier",
      betragCents: 1599,
      kategorie: "Büromaterial",
      decidedAt: "2026-05-22T03:00:00+02:00",
      decidedByUserId: "admin-1",
      send_attempt: 2,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.send_attempt).toBe(2);
  });

  it("skips sendMail when submitterEmail is null", async () => {
    await bus.emit("auslage.approved", {
      submissionId: "sub-009",
      submissionBusinessId: "AUS-2026-009",
      submitterEmail: null,
      vorname: null,
      bezeichnung: "Verein-bezahlt expense",
      betragCents: 500,
      kategorie: "Büromaterial",
      decidedAt: "2026-05-22T03:00:00+02:00",
      decidedByUserId: "admin-1",
      send_attempt: 0,
    });

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("swallows sendMail errors (best-effort) so they don't break the caller", async () => {
    sendMailMock.mockRejectedValueOnce(new Error("provider down"));

    // Should not throw despite the mail provider failing.
    await expect(
      bus.emit("auslage.approved", {
        submissionId: "sub-010",
        submissionBusinessId: "AUS-2026-010",
        submitterEmail: "max@example.org",
        vorname: "Max",
        bezeichnung: "Druckerpapier",
        betragCents: 1599,
        kategorie: "Büromaterial",
        decidedAt: "2026-05-22T03:00:00+02:00",
        decidedByUserId: "admin-1",
        send_attempt: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
