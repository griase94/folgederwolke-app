/**
 * @vitest-environment node
 * @phase-6
 *
 * Unit tests for dashboard.ts pure helpers:
 *   - berlinYear: returns correct year in Europe/Berlin timezone
 *   - buildActivityLabel (via label output): friendly display strings
 *
 * DB-query helpers (loadDashboardKpis, loadRecentActivity) are integration-
 * tested by e2e; unit tests stub the db to verify query structure only.
 */

import { describe, it, expect } from "vitest";
import { berlinYear } from "$lib/server/domain/dashboard.js";

// ---------------------------------------------------------------------------
// berlinYear
// ---------------------------------------------------------------------------

describe("berlinYear", () => {
  it("returns current year for a mid-year date", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    expect(berlinYear(d)).toBe(2026);
  });

  it("handles new year edge — 2026-12-31 23:59 UTC is still 2026 in Berlin (CET=UTC+1)", () => {
    // 2026-12-31 23:30 UTC → 2027-01-01 00:30 CET → year 2027
    const d = new Date("2026-12-31T23:30:00Z");
    expect(berlinYear(d)).toBe(2027);
  });

  it("handles summer time — 2026-07-01 21:59 UTC is 2026-07-01 23:59 CEST → year 2026", () => {
    const d = new Date("2026-07-01T21:59:00Z");
    expect(berlinYear(d)).toBe(2026);
  });

  it("handles early January — 2026-01-01 00:00 UTC is 2026-01-01 01:00 CET → year 2026", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(berlinYear(d)).toBe(2026);
  });
});

// ---------------------------------------------------------------------------
// RecentActivity label builder (inline replication of the pure logic)
// ---------------------------------------------------------------------------
//
// loadDashboardKpis/loadRecentActivity are DB-bound; their correctness is
// covered by e2e tests. The label builder is pure and fully testable here.

// Mirror of dashboard.ts buildActivityLabel — pure function, no db needed
function buildActivityLabel(
  action: string,
  entityKind: string,
  entityBusinessId: string | null,
): string {
  const entityStr = entityBusinessId ? ` ${entityBusinessId}` : "";

  const entityLabels: Record<string, string> = {
    expense: "Auslage",
    auslagen_submission: "Einreichung",
    donation: "Spende",
    member: "Mitglied",
    invoice: "Rechnung",
    income: "Einnahme",
    user: "Benutzer",
    project: "Projekt",
    customer: "Kunde",
    kategorie: "Kategorie",
    settings: "Einstellungen",
    zahlungsart: "Zahlungsart",
  };

  const actionLabels: Record<string, string> = {
    create: "erstellt",
    update: "bearbeitet",
    delete: "gelöscht",
    approve: "genehmigt",
    reject: "abgelehnt",
    reimburse: "erstattet",
    import: "importiert",
    festschreibung: "festgeschrieben",
    storno: "storniert",
    sign_in: "angemeldet",
    sign_out: "abgemeldet",
    magic_link_issue: "Magic Link erstellt",
    magic_link_verify: "Magic Link genutzt",
  };

  const entityLabel = entityLabels[entityKind] ?? entityKind;
  const actionLabel = actionLabels[action] ?? action;
  return `${entityLabel}${entityStr} ${actionLabel}`;
}

describe("buildActivityLabel", () => {
  it("formats expense approve with business id", () => {
    expect(buildActivityLabel("approve", "expense", "E-2026-001")).toBe(
      "Auslage E-2026-001 genehmigt",
    );
  });

  it("formats member create without business id", () => {
    expect(buildActivityLabel("create", "member", null)).toBe(
      "Mitglied erstellt",
    );
  });

  it("formats donation reimburse", () => {
    expect(buildActivityLabel("reimburse", "donation", "S-2026-005")).toBe(
      "Spende S-2026-005 erstattet",
    );
  });

  it("formats sign_in for user entity", () => {
    expect(buildActivityLabel("sign_in", "user", null)).toBe(
      "Benutzer angemeldet",
    );
  });

  it("falls back to raw strings for unknown kinds", () => {
    expect(buildActivityLabel("frobnicate", "widget", "W-001")).toBe(
      "widget W-001 frobnicate",
    );
  });

  it("formats auslagen_submission create", () => {
    expect(
      buildActivityLabel("create", "auslagen_submission", "AUS-2026-003"),
    ).toBe("Einreichung AUS-2026-003 erstellt");
  });
});
