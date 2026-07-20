import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import SaldoVerlauf from "./SaldoVerlauf.svelte";

afterEach(() => cleanup());

const growth = [
  1164000, 1218000, 1176000, 1232000, 1278000, 1326000, 1348000, 1294000,
  1362000, 1418000, 1512000, 1482045,
];

describe("SaldoVerlauf", () => {
  it("renders the hero with the current stand in de-DE and a sr-only table twin", () => {
    render(SaldoVerlauf, {
      props: { monthlyCents: growth, openingCents: 1118000, year: 2026 },
    });
    expect(screen.getByTestId("saldo-verlauf")).toBeTruthy();
    expect(screen.getByTestId("saldo-hero").textContent).toContain("14.820");
    // sr-only twin lists every month
    expect(
      screen.getByTestId("saldo-table").querySelectorAll("tbody tr"),
    ).toHaveLength(12);
  });

  it("renders a deficit series with a signed Δ and never crashes on a 2-point series", () => {
    render(SaldoVerlauf, {
      props: {
        monthlyCents: [300000, -18000],
        openingCents: 340000,
        year: 2026,
      },
    });
    const delta = screen.getByTestId("saldo-delta");
    expect(delta.textContent).toMatch(/−/); // real minus on the negative Δ
  });
});
