/**
 * Task 5 — DerivedKategorieBadge (spec §9.2 + §13).
 *
 * Read-only hint showing the three derived facts: Sphäre (always Ideeller, §4.5)
 * · Kategorie (deriveDonationKategorieName) · Anlage-Gem Zeile (only when known).
 * NO Kategorie picker — this badge replaces it.
 */

import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DerivedKategorieBadge from "./DerivedKategorieBadge.svelte";

describe("DerivedKategorieBadge", () => {
  it("shows the derived Ideeller + Kategorie for the chosen pickers (no Zeile)", () => {
    render(DerivedKategorieBadge, {
      props: {
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        anlageGemZeile: null,
      },
    });
    expect(screen.getByText(/Ideeller/)).toBeTruthy();
    expect(screen.getByText(/Geldspende zweckgebunden/)).toBeTruthy();
    expect(screen.queryByText(/Anlage Gem Zeile/)).toBeNull(); // degrades gracefully
  });

  it("renders the Anlage-Gem Zeile fact when a Zeile is known", () => {
    render(DerivedKategorieBadge, {
      props: {
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        anlageGemZeile: 5,
      },
    });
    expect(screen.getByText(/Anlage Gem Zeile 5/)).toBeTruthy();
  });

  it("derives 'Sachspende' for a Sachspende regardless of Zweckbindung", () => {
    render(DerivedKategorieBadge, {
      props: {
        spendeKind: "sachspende",
        zweckbindungKind: "zweckfrei",
        anlageGemZeile: null,
      },
    });
    expect(screen.getByText(/Sachspende/)).toBeTruthy();
    expect(screen.getByText(/Ideeller/)).toBeTruthy();
  });
});
