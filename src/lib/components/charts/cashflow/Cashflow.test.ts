import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import Cashflow from "./Cashflow.svelte";

afterEach(() => cleanup());

const months = Array.from({ length: 12 }, (_, i) => ({
  einnahmenCents: (i + 1) * 10000,
  ausgabenCents: (12 - i) * 8000,
}));

describe("Cashflow", () => {
  it("renders the chart + a full sr-only table with signed Netto", () => {
    render(Cashflow, { props: { months, year: 2026 } });
    expect(screen.getByTestId("cashflow")).toBeTruthy();
    const rows = screen
      .getByTestId("cashflow-table")
      .querySelectorAll("tbody tr");
    expect(rows).toHaveLength(12);
    // Netto column carries a signed value (+/−)
    expect(screen.getByTestId("cashflow-table").textContent).toMatch(/[+−]/);
  });

  it("handles an all-zero year without dividing by zero", () => {
    const zero = Array.from({ length: 12 }, () => ({
      einnahmenCents: 0,
      ausgabenCents: 0,
    }));
    expect(() =>
      render(Cashflow, { props: { months: zero, year: 2026 } }),
    ).not.toThrow();
  });
});
