/**
 * MemberRow — beitrag pill + one-tap pay tests.
 *
 * The row renders a single current-year BeitragCell(variant='pill') fed from the
 * pre-resolved matrix cells (Aurora C-S2: single MatrixData source, no per-row
 * resolveBeitragState re-derivation), plus a one-tap pay trigger integrated into
 * the row; the kebab remains as secondary overflow only.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberRow from "./MemberRow.svelte";
import type { MemberView } from "$lib/domain/members.js";
import type { CellState, MatrixCell } from "$lib/domain/beitrag-cell.js";

afterEach(() => cleanup());

const MEMBER_ID = "mem_1";

function makeMember(overrides: Partial<MemberView> = {}): MemberView {
  return {
    id: MEMBER_ID,
    vorname: "Ada",
    nachname: "Lovelace",
    email: "ada@example.com",
    iban: null,
    telefon: null,
    adresse: null,
    dateOfBirth: null,
    role: "mitglied",
    eintrittsDatum: "2020-01-01",
    austrittsDatum: null,
    beitragExempt: false,
    beitragExemptReason: null,
    isFixture: false,
    createdAt: "2020-01-01",
    ...overrides,
  };
}

function cell(
  state: CellState,
  opts: {
    year?: number;
    betragCents?: number;
    paidCents?: number;
    gezahltAm?: string | null;
  } = {},
): MatrixCell {
  return {
    memberId: MEMBER_ID,
    year: opts.year ?? 2026,
    state,
    isLocked: false,
    betragCents: opts.betragCents ?? 6000,
    paidCents: opts.paidCents ?? 0,
    gezahltAm: opts.gezahltAm ?? null,
    exemptReason: null,
    daysOverdue: null,
  };
}

function cellsMap(...cs: MatrixCell[]): Map<string, MatrixCell> {
  return new Map(cs.map((c) => [`${c.memberId}:${c.year}`, c]));
}

describe("MemberRow — beitrag pill + pay trigger", () => {
  it("renders a single Beitrag pill (data-testid=beitrag-status-pill) for the current year", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
        onEdit: () => {},
      },
    });
    expect(
      container.querySelector("[data-testid='beitrag-status-pill']"),
    ).toBeTruthy();
  });

  it("shows only ONE pill for the current year (not multiple year chips)", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2024, 2025, 2026],
        cells: cellsMap(
          cell("paid", {
            year: 2024,
            paidCents: 6000,
            gezahltAm: "2024-02-01",
          }),
          cell("paid", {
            year: 2025,
            paidCents: 6000,
            gezahltAm: "2025-02-01",
          }),
          cell("open", { year: 2026 }),
        ),
        onEdit: () => {},
      },
    });
    expect(
      container.querySelectorAll("[data-testid='beitrag-status-pill']").length,
    ).toBe(1);
  });

  it("paid state: pill shows emerald paid styling", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(
          cell("paid", { paidCents: 6000, gezahltAm: "2026-02-01" }),
        ),
        onEdit: () => {},
      },
    });
    const pill = container.querySelector("[data-state='paid']");
    expect(pill).toBeTruthy();
    expect(pill!.className).toMatch(/emerald/);
  });

  it("open state: pill shows open styling (not emerald)", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
        onEdit: () => {},
      },
    });
    const pill = container.querySelector("[data-state='open']");
    expect(pill).toBeTruthy();
    expect(pill!.className).not.toMatch(/emerald/);
  });

  it("partial state: pill shows the partial fraction", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("partial", { paidCents: 3000 })),
        onEdit: () => {},
      },
    });
    expect(container.querySelector("[data-state='partial']")).toBeTruthy();
  });

  it("exempt member: pill shows the befreit state and no pay trigger", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember({ beitragExempt: true }),
        years: [2026],
        cells: cellsMap(cell("exempt")),
        onEdit: () => {},
      },
    });
    expect(
      container.querySelector("[data-testid='beitrag-status-pill']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-testid='member-row-pay']"),
    ).toBeFalsy();
  });

  it("open state: renders a one-tap pay trigger button", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
        onEdit: () => {},
      },
    });
    expect(
      container.querySelector("[data-testid='member-row-pay']"),
    ).toBeTruthy();
  });

  it("paid state: no pay trigger shown (edit is in the kebab)", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(
          cell("paid", { paidCents: 6000, gezahltAm: "2026-02-01" }),
        ),
        onEdit: () => {},
      },
    });
    expect(
      container.querySelector("[data-testid='member-row-pay']"),
    ).toBeFalsy();
  });

  it("kebab menu button is still rendered (secondary overflow)", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
        onEdit: () => {},
      },
    });
    expect(container.querySelector("[aria-label*='Aktionen']")).toBeTruthy();
  });
});
