import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import FreigrenzeGauge from "./FreigrenzeGauge.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

describe("FreigrenzeGauge", () => {
  it("safe state prints the hero Umsatz + the freier Spielraum (cap − value)", () => {
    render(FreigrenzeGauge, { props: { umsatzCents: 1575000, year: 2026 } });
    expect(screen.getByTestId("freigrenze-gauge")).toBeTruthy();
    expect(nb(screen.getByTestId("freigrenze-hero").textContent)).toContain(
      "15.750 €",
    );
    // 50.000 − 15.750 = 34.250 € freier Spielraum
    expect(
      nb(screen.getByTestId("freigrenze-spielraum").textContent),
    ).toContain("34.250 €");
  });

  it("over-limit flips the readout to 'Über der Freigrenze' with the overage", () => {
    render(FreigrenzeGauge, { props: { umsatzCents: 5300000, year: 2026 } });
    const s = nb(screen.getByTestId("freigrenze-spielraum").textContent);
    expect(s).toContain("Über der Freigrenze");
    expect(s).toContain("3.000 €"); // 53.000 − 50.000
  });
});
