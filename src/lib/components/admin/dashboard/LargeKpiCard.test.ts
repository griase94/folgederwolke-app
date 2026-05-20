/**
 * Unit tests for LargeKpiCard — the dashboard's headline KPI tile.
 *
 * Composition:
 *   - shadcn Card primitive (data-slot="card")
 *   - Money primitive for the big number (data-testid="money")
 *   - Sparkline (12 monthly cents, data-testid="sparkline")
 *   - LY-delta chip showing the +/- vs. same-period last year, in percent
 *
 * Props:
 *   label: string ("Einnahmen YTD")
 *   valueInCents: number
 *   sparklineData: number[] (12 monthly cents)
 *   lyValueInCents: number (last-year-same-period total in cents)
 *   tone?: 'income' | 'expense'  (drives sparkline color, default income)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import LargeKpiCard from "./LargeKpiCard.svelte";

afterEach(() => cleanup());

const sparkData = [
  1000, 1200, 1100, 1300, 1500, 1400, 1600, 1800, 1700, 1900, 2000, 2100,
];

describe("LargeKpiCard", () => {
  it("renders the label", () => {
    render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
      },
    });
    expect(screen.getByText("Einnahmen YTD")).toBeTruthy();
  });

  it("renders the Money primitive with the YTD value", () => {
    render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
      },
    });
    const money = screen.getByTestId("money");
    expect(money.textContent?.replace(/\s/g, " ")).toMatch(/15\.000,00\s€/);
  });

  it("renders the sparkline", () => {
    render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
      },
    });
    expect(screen.getByTestId("sparkline")).toBeTruthy();
  });

  it("shows LY-delta chip with +50% for a 50% increase", () => {
    render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
      },
    });
    const chip = screen.getByTestId("ly-delta-chip");
    expect(chip.textContent).toMatch(/\+50/);
  });

  it("shows LY-delta chip with -25% for a 25% decrease", () => {
    render(LargeKpiCard, {
      props: {
        label: "Ausgaben YTD",
        valueInCents: 750000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
        tone: "expense",
      },
    });
    const chip = screen.getByTestId("ly-delta-chip");
    expect(chip.textContent).toMatch(/-25|−25/);
  });

  it("displays — (em dash) for LY chip when last year is zero", () => {
    render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 0,
      },
    });
    const chip = screen.getByTestId("ly-delta-chip");
    expect(chip.textContent?.trim()).toMatch(/—|–|n\/v/);
  });

  it("uses the shadcn Card primitive (data-slot=card)", () => {
    const { container } = render(LargeKpiCard, {
      props: {
        label: "Einnahmen YTD",
        valueInCents: 1500000,
        sparklineData: sparkData,
        lyValueInCents: 1000000,
      },
    });
    expect(container.querySelector("[data-slot='card']")).toBeTruthy();
  });
});
