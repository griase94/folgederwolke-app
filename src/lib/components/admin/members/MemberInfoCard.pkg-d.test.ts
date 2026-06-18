/**
 * MemberInfoCard — Package D tests.
 *
 * D5: compact BeitragStatusPill for current year + REMOVE Fixture badge.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberInfoCard from "./MemberInfoCard.svelte";

afterEach(() => cleanup());

function makeMember(overrides: Record<string, unknown> = {}) {
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
    isFixture: true,
    createdAt: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("MemberInfoCard — Package D", () => {
  it("does NOT render a Fixture badge even when isFixture=true", () => {
    const { container } = render(MemberInfoCard, {
      props: {
        member: makeMember({ isFixture: true }),
        currentYear: 2026,
        currentYearState: null,
      },
    });
    // Fixture badge should be removed in Package D
    const fixtureBadge = container.querySelector(
      "[data-testid='fixture-badge']",
    );
    expect(fixtureBadge).toBeFalsy();
    // Also check for text
    expect(container.textContent).not.toMatch(/\bFixture\b/);
  });

  it("renders a compact BeitragStatusPill when currentYearState is provided", () => {
    const { container } = render(MemberInfoCard, {
      props: {
        member: makeMember({ isFixture: false }),
        currentYear: 2026,
        currentYearState: {
          state: "open",
          betragCents: 6000,
          paidCents: 0,
          isLocked: false,
          satzMissing: false,
        },
      },
    });
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeTruthy();
  });

  it("pill shows paid state with emerald styling", () => {
    const { container } = render(MemberInfoCard, {
      props: {
        member: makeMember({ isFixture: false }),
        currentYear: 2026,
        currentYearState: {
          state: "paid",
          betragCents: 6000,
          paidCents: 6000,
          isLocked: false,
          satzMissing: false,
        },
      },
    });
    const pill = container.querySelector("[data-state='paid']");
    expect(pill).toBeTruthy();
    expect(pill!.className).toMatch(/emerald/);
  });

  it("no pill when currentYearState is null", () => {
    const { container } = render(MemberInfoCard, {
      props: {
        member: makeMember(),
        currentYear: 2026,
        currentYearState: null,
      },
    });
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeFalsy();
  });
});
