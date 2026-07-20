/**
 * @phase-aurora-slice4
 * Stand strip (spec §7 · dataviz saldo-verlauf): eyebrow SALDO {year}, running
 * Saldo sparkline hero (SaldoVerlauf), zugesagt/frei subline (current year
 * only), stat triplet with Buchungen micro-captions, Festschreibung lock chip.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import StandStrip from "./StandStrip.svelte";

afterEach(() => cleanup());

const base = {
  saldoCents: 123456, // 1.234,56 €
  zugesagtCents: 5000,
  einnahmenCents: 200000,
  einnahmenCount: 12,
  spendenCents: 30000,
  spendenCount: 1,
  ausgabenCents: 106544,
  ausgabenCount: 7,
  // Monthly cash so the running-saldo sparkline endpoint === saldoCents.
  einnahmenMonthlyCents: [50000, 40000, 30000, 80000, 0, 0, 0, 0, 0, 0, 0, 0],
  ausgabenMonthlyCents: [20000, 10000, 30000, 16544, 0, 0, 0, 0, 0, 0, 0, 0],
  selectedYear: 2026,
  currentYear: 2026,
  festgeschriebenBis: null as number | null,
};

describe("StandStrip", () => {
  it("renders the SALDO eyebrow with the selected year", () => {
    render(StandStrip, { props: base });
    expect(screen.getByText(/Saldo 2026/i)).toBeTruthy();
  });

  it("renders the saldo-verlauf sparkline hero", () => {
    render(StandStrip, { props: base });
    expect(screen.getByTestId("saldo-verlauf")).toBeTruthy();
    expect(screen.getByTestId("saldo-hero")).toBeTruthy();
  });

  it("subline shows zugesagt and frei (saldo − zugesagt) in the current year", () => {
    render(StandStrip, { props: base });
    const subline = screen.getByTestId("stand-subline");
    expect(subline.textContent).toContain("50,00");
    expect(subline.textContent).toContain("zugesagt");
    expect(subline.textContent).toContain("1.184,56"); // 1234,56 − 50,00
    expect(subline.textContent).toContain("frei");
  });

  it("subline is hidden when selectedYear ≠ currentYear", () => {
    render(StandStrip, { props: { ...base, selectedYear: 2025 } });
    expect(screen.queryByTestId("stand-subline")).toBeNull();
  });

  it("stat triplet shows Buchungen micro-captions and a singular form", () => {
    render(StandStrip, { props: base });
    expect(screen.getByText("12 Buchungen")).toBeTruthy();
    expect(screen.getByText("1 Buchung")).toBeTruthy();
    expect(screen.getByText("7 Buchungen")).toBeTruthy();
  });

  it("Ausgaben stat renders with explicit minus sign", () => {
    render(StandStrip, { props: base });
    // Tolerate the ICU minus glyph (U+2212) as well as ASCII '-'.
    expect(screen.getByTestId("stand-stat-ausgaben").textContent).toMatch(
      /[-−]1\.065,44/,
    );
  });

  it("lock chip renders when the selected year is festgeschrieben", () => {
    const { unmount } = render(StandStrip, {
      props: { ...base, selectedYear: 2024, festgeschriebenBis: 2024 },
    });
    expect(screen.getByTestId("stand-lock-chip")).toBeTruthy();
    unmount();
    render(StandStrip, { props: base });
    expect(screen.queryByTestId("stand-lock-chip")).toBeNull();
  });
});
