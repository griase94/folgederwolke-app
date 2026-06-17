/**
 * Aurora inbox redesign — DecisionBand (spec §2.2 decision band).
 *  - label row: "Kategorie" + Sphäre chip (appears after a pick).
 *  - Freigeben is the only filled CTA (bg-primary-strong); gated /70 until Kategorie.
 *  - Ablehnen is severity-critical TEXT on white + hairline (never red fill).
 *  - pressing Freigeben with no Kategorie focuses the picker (no submit).
 *  - "Verzicht spenden" is a ghost link + "In Vorbereitung" chip.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// $app/forms enhance is a no-op passthrough in unit context.
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));

import DecisionBand from "./DecisionBand.svelte";

const baseProps = {
  submissionId: "id-1",
  ausId: "AUS-2026-007",
  kategorieOptions: [
    { name: "Bürobedarf", sphere: "wirtschaftlich" as const },
    { name: "Reisekosten", sphere: "ideeller" as const },
  ],
  festgeschriebenBis: null as number | null,
  currentYear: 2026,
};

afterEach(() => cleanup());

describe("DecisionBand", () => {
  it("renders the Kategorie label and a gated Freigeben CTA (/70 until chosen)", () => {
    render(DecisionBand, { props: baseProps });
    const freigeben = screen.getByTestId("decision-approve");
    expect(freigeben.textContent).toContain("Freigeben");
    expect(freigeben.className).toContain("bg-primary-strong");
    // Gated visual until a Kategorie is chosen.
    expect(freigeben.className).toMatch(/\/70|opacity/);
  });

  it("Ablehnen is severity-critical text on white, fixed 128px — never a red fill", () => {
    render(DecisionBand, { props: baseProps });
    const ablehnen = screen.getByTestId("decision-reject");
    expect(ablehnen.textContent).toContain("Ablehnen");
    expect(ablehnen.className).toContain("text-severity-critical-text");
    expect(ablehnen.className).toContain("w-32");
    expect(ablehnen.className).not.toContain("bg-severity-critical");
  });

  it("shows 'Fehlt noch: Kategorie' until a Kategorie is chosen; pressing Freigeben focuses the picker", async () => {
    render(DecisionBand, { props: baseProps });
    expect(screen.getByTestId("decision-missing").textContent).toContain(
      "Kategorie",
    );
    await fireEvent.click(screen.getByTestId("decision-approve"));
    expect(document.activeElement).toBe(screen.getByLabelText("Kategorie"));
  });

  it("choosing a Kategorie reveals the Sphäre chip and clears the missing list", async () => {
    render(DecisionBand, { props: baseProps });
    await fireEvent.change(screen.getByLabelText("Kategorie"), {
      target: { value: "Bürobedarf" },
    });
    expect(screen.getByTestId("decision-sphere").textContent).toMatch(/Sphäre/);
    expect(
      document.querySelector('[data-testid="decision-missing"]'),
    ).toBeNull();
  });

  it("'Verzicht spenden' is a ghost link with an 'In Vorbereitung' chip", () => {
    render(DecisionBand, { props: baseProps });
    expect(screen.getByText("Verzicht spenden")).toBeTruthy();
    expect(screen.getByText("In Vorbereitung")).toBeTruthy();
  });

  it("renders a LockBanner when the current year is festgeschrieben (festBis >= currentYear)", () => {
    render(DecisionBand, {
      props: { ...baseProps, festgeschriebenBis: 2026, currentYear: 2026 },
    });
    expect(screen.getByTestId("lock-banner")).toBeTruthy();
  });
});
