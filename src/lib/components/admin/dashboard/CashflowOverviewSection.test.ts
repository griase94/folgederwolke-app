/**
 * Unit tests for CashflowOverviewSection — the dashboard's headline 2-card
 * + 4-chip block.
 *
 * Covers (cycle 2):
 *   - C3-6: Saldo chip uses the <Money> primitive (data-testid="money")
 *           rather than inlining formatMoney() into raw text.
 *   - C3-9: Labels read "Einnahmen 2024" / "Ausgaben 2024" (year inlined),
 *           not the anglicism "Einnahmen YTD" / "Ausgaben YTD".
 *   - C3-3: Sphere chips render below each headline card (one per sphere).
 *   - C3-4: When selectedYear <= festgeschriebenBis, a lock icon (or
 *           data-testid="year-lock") sits next to the section heading.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import CashflowOverviewSection from "./CashflowOverviewSection.svelte";

afterEach(() => cleanup());

const cashflowFixture = {
  year: 2024,
  einnahmenYtdCents: 1_500_000,
  ausgabenYtdCents: 800_000,
  saldoCents: 700_000,
  einnahmenMonthlyCents: [
    1000, 1200, 1100, 1300, 1500, 1400, 1600, 1800, 1700, 1900, 2000, 2100,
  ],
  ausgabenMonthlyCents: [
    500, 600, 550, 650, 750, 700, 800, 900, 850, 950, 1000, 1050,
  ],
  einnahmenLyYtdCents: 1_200_000,
  ausgabenLyYtdCents: 600_000,
  openInvoicesCount: 2,
  einnahmenBySphereCents: {
    ideeller: 900_000,
    zweckbetrieb: 300_000,
    wirtschaftlich: 250_000,
    vermoegen: 50_000,
  },
  ausgabenBySphereCents: {
    ideeller: 100_000,
    zweckbetrieb: 400_000,
    wirtschaftlich: 250_000,
    vermoegen: 50_000,
  },
};

describe("CashflowOverviewSection (cycle 2)", () => {
  it("labels cards with the year, no 'YTD' anglicism (C3-9)", () => {
    render(CashflowOverviewSection, {
      props: {
        cashflow: cashflowFixture,
        openInboxCount: 3,
        activeMemberCount: 12,
      },
    });
    // "Einnahmen 2024" and "Ausgaben 2024"
    expect(screen.getAllByText(/Einnahmen 2024/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ausgaben 2024/i).length).toBeGreaterThan(0);
    // No "YTD" anywhere visible
    expect(screen.queryAllByText(/YTD/i).length).toBe(0);
  });

  it("renders Saldo chip via the Money primitive (C3-6)", () => {
    const { container } = render(CashflowOverviewSection, {
      props: {
        cashflow: cashflowFixture,
        openInboxCount: 0,
        activeMemberCount: 0,
      },
    });
    // The Saldo link-chip should contain at least one Money element.
    const moneys = container.querySelectorAll("[data-testid='money']");
    // 2 hero cards + 1 saldo chip = at least 3 Money elements.
    expect(moneys.length).toBeGreaterThanOrEqual(3);
  });

  it("renders 4 sphere chips below each headline card (C3-3)", () => {
    const { container } = render(CashflowOverviewSection, {
      props: {
        cashflow: cashflowFixture,
        openInboxCount: 0,
        activeMemberCount: 0,
      },
    });
    const chips = container.querySelectorAll("[data-testid='sphere-chip']");
    // 4 spheres × 2 cards = 8 chips total.
    expect(chips.length).toBeGreaterThanOrEqual(8);
  });

  it("shows year-lock indicator when selectedYear <= festgeschriebenBis (C3-4)", () => {
    const { container } = render(CashflowOverviewSection, {
      props: {
        cashflow: cashflowFixture,
        openInboxCount: 0,
        activeMemberCount: 0,
        festgeschriebenBis: 2024,
      },
    });
    expect(container.querySelector("[data-testid='year-lock']")).toBeTruthy();
  });

  it("hides year-lock indicator when selectedYear > festgeschriebenBis", () => {
    const { container } = render(CashflowOverviewSection, {
      props: {
        cashflow: cashflowFixture,
        openInboxCount: 0,
        activeMemberCount: 0,
        festgeschriebenBis: 2023,
      },
    });
    expect(container.querySelector("[data-testid='year-lock']")).toBeNull();
  });
});
