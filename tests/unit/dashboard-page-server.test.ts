/**
 * @vitest-environment node
 * @phase-6
 *
 * Characterisation test for src/routes/app/+page.server.ts (PR1 refactor).
 *
 * Verifies that after the PR1 latency refactor:
 *   1. beitragsuebersicht shape is identical (was serial tail, now in
 *      Promise.all fan-out — numbers must not change).
 *   2. festgeschriebenBis is sourced from the layout parent() rather than a
 *      duplicate settings read.
 *   3. All expected top-level keys are present in the returned data.
 *
 * The DB-touching assertions are gated on DATABASE_URL being set; if Docker
 * is unavailable in this environment the shape/parent tests still run.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted)
// ---------------------------------------------------------------------------

const mockKpis = {
  openAuslagenCount: 2,
  approvedNotErstattetCount: 1,
  approvedNotErstattetSumCents: BigInt(5000),
  openBeitragsCount: 3,
  openBeitragsMembers: 3,
  spendenYtdCents: BigInt(10000),
  activeMemberCount: 10,
  wgb: { einnahmen: 0, ausgaben: 0, saldo: 0, byMonth: [] },
  cashflow: {
    einnahmen: 0,
    ausgaben: 0,
    saldo: 0,
    byMonth: [],
    topKategorien: [],
  },
};

const mockRecentActivity: unknown[] = [];
const mockTopProjekte: unknown[] = [];

vi.mock("$lib/server/domain/dashboard.js", () => ({
  loadDashboardKpis: vi.fn().mockResolvedValue(mockKpis),
  loadRecentActivity: vi.fn().mockResolvedValue(mockRecentActivity),
  topActiveProjects: vi.fn().mockResolvedValue(mockTopProjekte),
}));

// Beitragszeilen: one row returned by the DB query
const MOCK_BEITRAGS_ROW = {
  member_count: "7",
  paid_count: "4",
  paid_cents: "28000",
  open_count: "3",
  open_cents: "12000",
  overdue_count: "1",
  exempt_count: "1",
  last_payment: "2026-03-15",
  prior_years_unpaid: "0",
};

const mockDbExecute = vi.fn().mockResolvedValue([MOCK_BEITRAGS_ROW]);
vi.mock("$lib/server/db/index.js", () => ({
  getDb: vi.fn(() => ({ execute: mockDbExecute })),
}));

vi.mock("$lib/server/env.js", () => ({
  env: { PUBLIC_FORM_ENABLED: false },
  isPublicFormEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("$lib/domain/year.js", () => ({
  berlinYear: vi.fn().mockReturnValue(2026),
  currentBuchungsjahr: vi.fn().mockReturnValue(2026),
  selectYearFromUrl: vi.fn().mockReturnValue(2026),
  clampYearToAvailable: vi.fn((y: number) => y),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LAYOUT_FESTGESCHRIEBEN_BIS = 2024;

function makeLoadEvent(yearParam?: string) {
  return {
    url: new URL(
      yearParam
        ? `http://localhost/app?year=${yearParam}`
        : "http://localhost/app",
    ),
    locals: { session: { user: { id: "u1", role: "admin" } } },
    // parent() returns the layout data — festgeschriebenBis comes from here
    parent: vi.fn().mockResolvedValue({
      festgeschriebenBis: LAYOUT_FESTGESCHRIEBEN_BIS,
      user: { id: "u1", role: "admin" },
      availableYears: [],
      selectedYear: 2026,
      currentYear: 2026,
      formEnabled: false,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// load() return type is `void | Data` — helper narrows it for assertions.
async function runLoad(event: ReturnType<typeof makeLoadEvent>) {
  const { load } = await import("../../src/routes/app/+page.server.js");
  const result = await load(event as never);
  if (!result) throw new Error("load() returned void — expected data");
  // Cast through unknown to a plain record so property access is type-safe
  // without needing to import the generated $types.
  return result as unknown as Record<string, unknown> & {
    beitragsuebersicht: {
      year: number;
      memberCount: number;
      paidMemberCount: number;
      paidCents: number;
      openMemberCount: number;
      offenCents: number;
      overdueCount: number;
      lastPaymentDate: string | null;
      priorYearsUnpaidCount: number;
    };
    festgeschriebenBis: number | null;
  };
}

describe("@phase-6 dashboard +page.server load() — PR1 characterisation", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDbExecute.mockResolvedValue([MOCK_BEITRAGS_ROW]);
  });

  it("returns beitragsuebersicht with correct numeric shape from DB row", async () => {
    const event = makeLoadEvent();
    const data = await runLoad(event);

    expect(data.beitragsuebersicht).toEqual({
      year: 2026,
      memberCount: 7,
      paidMemberCount: 4,
      paidCents: 28000,
      openMemberCount: 3,
      offenCents: 12000,
      overdueCount: 1,
      exemptMemberCount: 1,
      lastPaymentDate: "2026-03-15",
      priorYearsUnpaidCount: 0,
    });
  });

  it("sources festgeschriebenBis from layout parent() — not a duplicate settings read", async () => {
    const event = makeLoadEvent();
    const data = await runLoad(event);

    // Must equal the layout value, not a separately-read one
    expect(data.festgeschriebenBis).toBe(LAYOUT_FESTGESCHRIEBEN_BIS);
    // parent() must have been called exactly once
    expect(event.parent).toHaveBeenCalledTimes(1);
  });

  it("returns all expected top-level keys", async () => {
    const event = makeLoadEvent();
    const data = await runLoad(event);

    const keys = Object.keys(data);
    expect(keys).toContain("beitragsuebersicht");
    expect(keys).toContain("festgeschriebenBis");
    expect(keys).toContain("recentActivity");
    expect(keys).toContain("topProjekte");
    expect(keys).toContain("cashflow");
    expect(keys).toContain("wgb");
  });

  it("handles empty beitrags DB result gracefully (falls back to zeros)", async () => {
    mockDbExecute.mockResolvedValueOnce([]);
    const event = makeLoadEvent();
    const data = await runLoad(event);

    expect(data.beitragsuebersicht.memberCount).toBe(0);
    expect(data.beitragsuebersicht.paidCents).toBe(0);
    expect(data.beitragsuebersicht.lastPaymentDate).toBeNull();
  });
});
