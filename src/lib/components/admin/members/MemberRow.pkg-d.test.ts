/**
 * MemberRow — Package D tests.
 *
 * D1: single current-year BeitragStatusPill via resolveBeitragState;
 *     one-tap pay trigger integrated into the row;
 *     kebab remains as secondary overflow only.
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

afterEach(() => cleanup());

function makeMember(overrides: Partial<MemberView> = {}): MemberView {
  return {
    id: "mem_1",
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
    beitrags: {
      2026: {
        id: "b1",
        betragCents: 6000,
        paidCents: 0,
        gezahltAm: null,
      },
    },
    ...overrides,
  };
}

describe("MemberRow — Package D", () => {
  it("renders a BeitragStatusPill (data-testid=beitrag-status-pill) for the current year", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeTruthy();
  });

  it("shows only ONE pill for current year (not multiple year chips)", () => {
    const member = makeMember({
      beitrags: {
        2024: {
          id: "b1",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2024-02-01",
        },
        2025: {
          id: "b2",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2025-02-01",
        },
        2026: { id: "b3", betragCents: 6000, paidCents: 0, gezahltAm: null },
      },
    });
    const { container } = render(MemberRow, {
      props: {
        member,
        years: [2024, 2025, 2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    // Only one pill should be rendered (current year only)
    const pills = container.querySelectorAll(
      "[data-testid='beitrag-status-pill']",
    );
    expect(pills.length).toBe(1);
  });

  it("paid state: pill shows emerald paid styling", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberRow, {
      props: {
        member,
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const pill = container.querySelector("[data-state='paid']");
    expect(pill).toBeTruthy();
    expect(pill!.className).toMatch(/emerald/);
  });

  it("open state: pill shows open styling with primary/rosa tokens", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const pill = container.querySelector("[data-state='open']");
    expect(pill).toBeTruthy();
    // rosa = primary token, not emerald
    expect(pill!.className).not.toMatch(/emerald/);
  });

  it("partial state: pill shows partial fraction", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 3000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberRow, {
      props: {
        member,
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const pill = container.querySelector("[data-state='partial']");
    expect(pill).toBeTruthy();
  });

  it("exempt member: pill shows exempt/befreit state, no pay trigger", () => {
    const member = makeMember({ beitragExempt: true, beitrags: {} });
    const { container } = render(MemberRow, {
      props: {
        member,
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    // Should show exempt pill
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeTruthy();
    // No pay trigger button
    const payTrigger = container.querySelector(
      "[data-testid='member-row-pay']",
    );
    expect(payTrigger).toBeFalsy();
  });

  it("open state: renders a one-tap pay trigger button", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const payTrigger = container.querySelector(
      "[data-testid='member-row-pay']",
    );
    expect(payTrigger).toBeTruthy();
  });

  it("paid state: no pay trigger shown (edit is in kebab)", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberRow, {
      props: {
        member,
        years: [2026],
        onEdit: () => {},
        satzByYear: { 2026: 6000 },
      },
    });
    const payTrigger = container.querySelector(
      "[data-testid='member-row-pay']",
    );
    expect(payTrigger).toBeFalsy();
  });

  it("kebab menu button is still rendered (secondary overflow)", () => {
    const { container } = render(MemberRow, {
      props: {
        member: makeMember(),
        years: [2026],
        onEdit: () => {},
        satzByYear: {},
      },
    });
    // The kebab trigger should exist
    const kebab = container.querySelector("[aria-label*='Aktionen']");
    expect(kebab).toBeTruthy();
  });
});
