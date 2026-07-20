import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import FactsTable from "./FactsTable.svelte";
import type { FactRow } from "./FactsTable.svelte";

afterEach(() => cleanup());

const rows: FactRow[] = [
  { label: "Name", value: "Julia Brunner" },
  { label: "Betrag", value: "12,50 €", variant: "amount", tone: "ausgabe" },
  { label: "IBAN", value: "DE02 1203 0000 0000 2020 51", variant: "iban" },
  {
    label: "Verwendungszweck",
    value:
      "Eine ausführliche Beschreibung, die deutlich länger als vierzig Zeichen ist.",
  },
];

describe("FactsTable", () => {
  it("renders one row per fact", () => {
    render(FactsTable, { props: { rows } });
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Betrag")).toBeTruthy();
    expect(screen.getByText("IBAN")).toBeTruthy();
  });

  it("invariant: inline values share ONE right-hand ruler (text-right)", () => {
    render(FactsTable, { props: { rows } });
    const value = screen.getByText("Julia Brunner");
    expect(value.className).toContain("text-right");
  });

  it("invariant: IBAN is nowrap and never truncated/ellipsised", () => {
    render(FactsTable, { props: { rows } });
    const iban = screen.getByText("DE02 1203 0000 0000 2020 51");
    expect(iban.className).toContain("whitespace-nowrap");
    expect(iban.className).not.toContain("truncate");
    expect(iban.getAttribute("data-variant")).toBe("iban");
  });

  it("collapses long free text into a full-width sub-row (not on the ruler)", () => {
    render(FactsTable, { props: { rows } });
    const long = screen.getByText(/ausführliche Beschreibung/);
    // block sub-row value is left-aligned (no text-right ruler class)
    expect(long.className).not.toContain("text-right");
    expect(long.closest('[data-slot="kv-block"]')).toBeTruthy();
  });

  it("applies the transaction-type tone to amount values", () => {
    render(FactsTable, { props: { rows } });
    const amount = screen.getByText("12,50 €");
    expect(amount.className).toContain("text-type-ausgabe");
  });
});
