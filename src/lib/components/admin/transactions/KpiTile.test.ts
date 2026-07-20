/**
 * KpiTile — a single type-list KPI tile: label + value, optional sub-line and
 * identity swatch, with data-* attributes spread onto the root.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import KpiTile from "./KpiTile.svelte";

afterEach(() => cleanup());

describe("KpiTile", () => {
  it("renders the label and pre-formatted value", () => {
    render(KpiTile, { props: { label: "Summe Ausgaben", value: "−12,00 €" } });
    expect(screen.getByText("Summe Ausgaben")).toBeTruthy();
    expect(screen.getByText("−12,00 €")).toBeTruthy();
  });

  it("renders the optional sub-line when given", () => {
    render(KpiTile, {
      props: {
        label: "Summe Spenden",
        value: "250,00 €",
        sub: "2026 · 12 Spenden",
      },
    });
    expect(screen.getByText("2026 · 12 Spenden")).toBeTruthy();
  });

  it("renders the accent swatch only when an accent colour is given", () => {
    const { container, unmount } = render(KpiTile, {
      props: {
        label: "Ideeller Bereich",
        value: "50,00 €",
        accent: "var(--sphere-ideeller)",
      },
    });
    const swatch = container.querySelector("span[style]");
    expect(swatch).toBeTruthy();
    expect(swatch!.getAttribute("style")).toContain("sphere-ideeller");
    unmount();

    const { container: bare } = render(KpiTile, {
      props: { label: "Anzahl", value: "4" },
    });
    expect(bare.querySelector("span[style]")).toBeNull();
  });

  it("spreads data-* attributes onto the root (sphere-split chips)", () => {
    const { container } = render(KpiTile, {
      props: {
        label: "Vermögen",
        value: "0,00 €",
        "data-sphere-chip": "",
        "data-sphere": "vermoegen",
      },
    });
    const chip = container.querySelector(
      '[data-sphere-chip][data-sphere="vermoegen"]',
    );
    expect(chip).toBeTruthy();
  });
});
