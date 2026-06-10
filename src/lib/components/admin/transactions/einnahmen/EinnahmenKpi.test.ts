// EinnahmenKpi.test.ts
//
// Phase 5 / Task 2 — the Einnahmen list KPI strip (Tier C2, spec §8.1).
//
// Asserts:
//  - the quiet anchor renders "Jahr · Summe · N" (year + count + total)
//  - ALL FOUR Sphären-Split chips render (Ideeller / Vermögen / Zweckbetrieb /
//    Wirtschaftlich), and an EMPTY sphere is shown as 0,00 € rather than hidden
//    (the split must always show all four for the gemeinnützigkeit reading)
//  - the ALL_YEARS anchor reads "Alle Jahre" (item 6 — was bare "Alle";
//    now matches the sibling tabs + the list empty state via yearScopeLabel)
//  - the 🔗 Rechnung badge (BezeichnungCell) shows ONLY when rechnungBusinessId
//    is set, and carries the "aus Rechnung {id}" accessible name
//
// Reset lane (renders Svelte components) → `pnpm test --run <file>`.
// Uses render/screen (project convention; never userEvent).
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import { ALL_YEARS } from "$lib/domain/year.js";
import EinnahmenKpi from "./EinnahmenKpi.svelte";
import BezeichnungCell from "./BezeichnungCell.svelte";

afterEach(() => cleanup());

const kpi = {
  totalCents: 1_250_00,
  count: 12,
  bySphere: {
    ideeller: 800_00,
    vermoegen: 0,
    zweckbetrieb: 300_00,
    wirtschaftlich: 150_00,
  },
};

describe("EinnahmenKpi — anchor + Sphären-Split chips", () => {
  it("renders the anchor (Jahr · Summe · N)", () => {
    render(EinnahmenKpi, { props: { ...kpi, year: 2026 } });
    expect(screen.getByText(/2026/)).toBeTruthy();
    // count appears in the anchor
    expect(screen.getByText(/12/)).toBeTruthy();
    // formatted total (1.250,00 €) appears in the anchor
    expect(screen.getByText(/1\.250,00\s*€/)).toBeTruthy();
  });

  it("renders 'Alle Jahre' in the anchor for the ALL_YEARS scope (item 6)", () => {
    render(EinnahmenKpi, { props: { ...kpi, year: ALL_YEARS } });
    expect(screen.getByText(/Alle Jahre/)).toBeTruthy();
  });

  it("uses the singular 'Buchung' at a count of 1 (item 6 — was '1 Buchungen')", () => {
    render(EinnahmenKpi, { props: { ...kpi, count: 1, year: 2026 } });
    expect(screen.getByText(/1 Buchung(?!en)/)).toBeTruthy();
  });

  it("renders all four Sphären-Split chips, incl. an empty (0,00 €) one", () => {
    const { container } = render(EinnahmenKpi, {
      props: { ...kpi, year: 2026 },
    });
    expect(screen.getByText(/Ideeller/i)).toBeTruthy();
    expect(screen.getByText(/Vermögen/i)).toBeTruthy();
    expect(screen.getByText(/Zweckbetrieb/i)).toBeTruthy();
    expect(screen.getByText(/Wirtschaftlich/i)).toBeTruthy();
    // the empty sphere (vermoegen) is shown as 0,00 € (exact), not omitted.
    // Scope to the vermoegen chip so the assertion isn't satisfied by the
    // "…0,00 €" suffix of a non-empty total.
    const vermoegenChip = container.querySelector(
      '[data-sphere-chip][data-sphere="vermoegen"]',
    );
    expect(vermoegenChip).toBeTruthy();
    expect(vermoegenChip!.textContent).toMatch(/(^|[^.\d])0,00\s*€/);
  });

  it("renders all four chips inside a horizontal-scroll strip (mobile §8.1)", () => {
    const { container } = render(EinnahmenKpi, {
      props: { ...kpi, year: 2026 },
    });
    const strip = container.querySelector('[data-slot="sphere-split"]');
    expect(strip).toBeTruthy();
    // overflow-x-auto strip carries one chip per sphere (all four present).
    const chips = container.querySelectorAll("[data-sphere-chip]");
    expect(chips.length).toBe(4);
  });
});

describe("Einnahmen BezeichnungCell — 🔗 Rechnung badge", () => {
  it("shows the 🔗 badge only when rechnungBusinessId is set", () => {
    const { container } = render(BezeichnungCell, {
      props: { bezeichnung: "Beitrag", rechnungBusinessId: "FDW-2026-014" },
    });
    expect(screen.getByText("Beitrag")).toBeTruthy();
    const badge = container.querySelector('[data-slot="rechnung-badge"]');
    expect(badge).toBeTruthy();
    // accessible name surfaces the linked Rechnung id.
    expect(badge!.getAttribute("aria-label")).toContain("FDW-2026-014");
    expect(badge!.getAttribute("title")).toContain("FDW-2026-014");
  });

  it("renders NO 🔗 badge for a free income row (rechnungBusinessId null)", () => {
    const { container } = render(BezeichnungCell, {
      props: { bezeichnung: "Spende bar", rechnungBusinessId: null },
    });
    expect(screen.getByText("Spende bar")).toBeTruthy();
    expect(container.querySelector('[data-slot="rechnung-badge"]')).toBeNull();
  });
});
