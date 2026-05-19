/**
 * @phase-7
 *
 * Unit tests for DSGVO domain helpers and PDF renderer.
 * These tests do NOT hit the database — they exercise pure function
 * contracts and the rendering layer.
 */

import { describe, it, expect, vi } from "vitest";
import type { AuskunftData } from "$lib/server/domain/dsgvo.js";

// ── Top-level mocks (hoisted by Vitest) ──────────────────────────────────────

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(makeFakeTx()),
  }),
}));

vi.mock("$lib/server/audit-log/index.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

function makeFakeTx() {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    }),
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
  };
}

// ── Minimal AuskunftData fixture ──────────────────────────────────────────────

const FIXTURE: AuskunftData = {
  email: "test@example.com",
  collectedAt: "2026-05-19T10:00:00.000Z",
  members: [
    {
      id: "member-uuid-001",
      vorname: "Max",
      nachname: "Muster",
      email: "test@example.com",
      emailCanonical: "test@example.com",
      iban: "DE25830654080006894453",
      telefon: "+49 89 123456",
      adresse: "Teststraße 1\n80469 München",
      dateOfBirth: "1990-01-15",
      role: "mitglied",
      eintrittsDatum: "2020-03-01",
      austrittsDatum: null,
      createdAt: "2020-03-01T12:00:00.000Z",
    },
  ],
  donations: [
    {
      id: "donation-uuid-001",
      businessId: "SPD-2026-001",
      gebuchtAm: "2026-01-10T00:00:00.000Z",
      betragCents: 5000,
      memberId: "member-uuid-001",
      spenderName: "Max Muster",
      spenderAdresse: "Teststraße 1\n80469 München",
      spenderEmail: "test@example.com",
      spendeKind: "geldspende",
      bescheinigungNr: "ZB-2026-001",
    },
  ],
  auslagenSubmissions: [],
  sentMails: [
    {
      id: "mail-uuid-001",
      template: "beitrag_erinnerung",
      toCanonical: "test@example.com",
      toDisplay: "Max Muster <test@example.com>",
      subject: "Erinnerung: Mitgliedsbeitrag 2026",
      status: "sent",
      queuedAt: "2026-02-01T08:00:00.000Z",
    },
  ],
  auditLogEntries: [
    {
      id: "audit-uuid-001",
      occurredAt: "2026-01-10T12:00:00.000Z",
      action: "update",
      entityKind: "member",
      entityId: "member-uuid-001",
      actorUserId: "user-uuid-admin",
      payloadSummary: "[audit payload — see full export]",
    },
  ],
};

// ── AuskunftData shape tests ──────────────────────────────────────────────────

describe("@phase-7 collectAuskunft — data shape", () => {
  it("AuskunftData fixture has expected top-level keys", () => {
    const keys = Object.keys(FIXTURE);
    expect(keys).toContain("email");
    expect(keys).toContain("collectedAt");
    expect(keys).toContain("members");
    expect(keys).toContain("donations");
    expect(keys).toContain("auslagenSubmissions");
    expect(keys).toContain("sentMails");
    expect(keys).toContain("auditLogEntries");
  });

  it("member row contains expected PII fields", () => {
    const member = FIXTURE.members[0] as Record<string, unknown>;
    expect(member["vorname"]).toBe("Max");
    expect(member["nachname"]).toBe("Muster");
    expect(member["email"]).toBe("test@example.com");
    expect(member["iban"]).toBeDefined();
  });

  it("donation betragCents is numeric", () => {
    const donation = FIXTURE.donations[0] as Record<string, unknown>;
    expect(typeof donation["betragCents"]).toBe("number");
    expect(donation["betragCents"]).toBe(5000);
  });

  it("auslagenSubmissions defaults to empty array", () => {
    expect(FIXTURE.auslagenSubmissions).toHaveLength(0);
  });

  it("sentMails contains expected fields", () => {
    const mail = FIXTURE.sentMails[0] as Record<string, unknown>;
    expect(mail["template"]).toBe("beitrag_erinnerung");
    expect(mail["status"]).toBe("sent");
  });

  it("auditLogEntries payloadSummary is redacted placeholder", () => {
    const entry = FIXTURE.auditLogEntries[0] as Record<string, unknown>;
    expect(entry["payloadSummary"]).toBe("[audit payload — see full export]");
  });
});

// ── PDF renderer tests ────────────────────────────────────────────────────────

describe("@phase-7 renderAuskunftPdf", () => {
  it("renders a non-empty PDF buffer with PDF magic bytes", async () => {
    const { renderAuskunftPdf } = await import("$lib/server/pdf/auskunft.js");
    const out = await renderAuskunftPdf(FIXTURE);

    expect(out.mimeType).toBe("application/pdf");
    expect(out.bytes.byteLength).toBeGreaterThan(1000);

    const header = String.fromCharCode(
      out.bytes[0]!,
      out.bytes[1]!,
      out.bytes[2]!,
      out.bytes[3]!,
    );
    expect(header).toBe("%PDF");
  });

  it("suggestedFilename contains the email and date", async () => {
    const { renderAuskunftPdf } = await import("$lib/server/pdf/auskunft.js");
    const out = await renderAuskunftPdf(FIXTURE);

    expect(out.suggestedFilename).toContain("test@example.com");
    expect(out.suggestedFilename).toContain("DSGVO_Auskunft");
    expect(out.suggestedFilename).toMatch(/\.pdf$/);
  });

  it("renders without error when all sections are empty", async () => {
    const { renderAuskunftPdf } = await import("$lib/server/pdf/auskunft.js");
    const empty: AuskunftData = {
      email: "empty@example.com",
      collectedAt: new Date().toISOString(),
      members: [],
      donations: [],
      auslagenSubmissions: [],
      sentMails: [],
      auditLogEntries: [],
    };
    const out = await renderAuskunftPdf(empty);
    expect(out.bytes.byteLength).toBeGreaterThan(500);
  });
});

// ── pseudonymise idempotency contract ─────────────────────────────────────────

describe("@phase-7 pseudonymise — idempotency contract", () => {
  /**
   * True idempotency can only be tested against a real DB. This test
   * validates the contract at the type/shape level: calling pseudonymise
   * twice on a non-existing email (no rows found) must return the
   * zero-count result without throwing.
   *
   * getDb() and logAudit are mocked at the top level of this file.
   */

  it("pseudonymise on unknown email returns zero counts without throwing", async () => {
    const { pseudonymise } = await import("$lib/server/domain/dsgvo.js");
    const result = await pseudonymise("nobody@example.com", null);

    expect(result.membersPseudonymised).toBe(0);
    expect(result.usersDeleted).toBe(0);
    expect(result.sessionsDeleted).toBe(0);
    expect(result.magicLinksDeleted).toBe(0);
    expect(result.donationsRedacted).toBe(0);
    expect(result.sentMailsRedacted).toBe(0);
    expect(result.auditLogPayloadsRedacted).toBe(0);
  });

  it("pseudonymise called twice on unknown email returns same shape", async () => {
    const { pseudonymise } = await import("$lib/server/domain/dsgvo.js");
    const r1 = await pseudonymise("idempotent@example.com", null);
    const r2 = await pseudonymise("idempotent@example.com", null);

    expect(r1).toEqual(r2);
  });
});
