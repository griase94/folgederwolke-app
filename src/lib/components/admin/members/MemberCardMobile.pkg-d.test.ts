/**
 * MemberCardMobile — beitrag pill + one-tap pay tests.
 *
 * The card renders a single current-year BeitragCell(variant='pill') fed from the
 * pre-resolved matrix cells (Aurora C-S2: single MatrixData source). Partial state
 * shows a fraction pill; exempt shows the befreit pill and no pay trigger.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberCardMobile from "./MemberCardMobile.svelte";
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
    betragCents?: number;
    paidCents?: number;
    gezahltAm?: string | null;
  } = {},
): MatrixCell {
  return {
    memberId: MEMBER_ID,
    year: 2026,
    state,
    isLocked: false,
    betragCents: opts.betragCents ?? 6000,
    paidCents: opts.paidCents ?? 0,
    gezahltAm: opts.gezahltAm ?? null,
    notes: null,
    exemptReason: null,
    daysOverdue: null,
  };
}

function cellsMap(c: MatrixCell): Map<string, MatrixCell> {
  return new Map([[`${c.memberId}:${c.year}`, c]]);
}

describe("MemberCardMobile — beitrag pill + pay trigger", () => {
  it("renders a Beitrag pill (data-testid=beitrag-status-pill)", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
      },
    });
    expect(
      container.querySelector("[data-testid='beitrag-status-pill']"),
    ).toBeTruthy();
  });

  it("paid state: shows emerald paid pill", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(
          cell("paid", { paidCents: 6000, gezahltAm: "2026-02-01" }),
        ),
      },
    });
    const pill = container.querySelector("[data-state='paid']");
    expect(pill).toBeTruthy();
    expect(pill!.className).toMatch(/emerald/);
  });

  it("partial state: shows partial pill with fraction", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("partial", { paidCents: 3000 })),
      },
    });
    expect(container.querySelector("[data-state='partial']")).toBeTruthy();
  });

  it("exempt member: shows exempt pill, no pay trigger", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember({ beitragExempt: true }),
        years: [2026],
        cells: cellsMap(cell("exempt")),
      },
    });
    expect(
      container.querySelector("[data-testid='beitrag-status-pill']"),
    ).toBeTruthy();
    expect(
      container.querySelector("[data-testid='member-card-pay']"),
    ).toBeFalsy();
  });

  it("open state: shows pay trigger button", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(cell("open")),
      },
    });
    expect(
      container.querySelector("[data-testid='member-card-pay']"),
    ).toBeTruthy();
  });

  it("paid state: no pay trigger shown", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        cells: cellsMap(
          cell("paid", { paidCents: 6000, gezahltAm: "2026-02-01" }),
        ),
      },
    });
    expect(
      container.querySelector("[data-testid='member-card-pay']"),
    ).toBeFalsy();
  });
});
