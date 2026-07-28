import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import FestschreibungModal from "./FestschreibungModal.svelte";
import type { FactRow } from "$lib/components/ui/facts-table/index.js";

afterEach(() => cleanup());

const facts: FactRow[] = [
  { label: "Buchungen", value: "152", variant: "num" },
  {
    label: "Überschuss",
    value: "2.000,00 €",
    variant: "amount",
    tone: "einnahme",
  },
];

describe("FestschreibungModal", () => {
  it("renders nothing when closed", () => {
    render(FestschreibungModal, { props: { open: false, year: 2025, facts } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open: title, facts, warnings + friction check; CTA disabled unconfirmed", () => {
    render(FestschreibungModal, {
      props: {
        open: true,
        year: 2025,
        facts,
        warnings: ["4 Spenden ohne Bescheinigung."],
        confirmed: false,
      },
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Buchungsjahr 2025 festschreiben?")).toBeTruthy();
    expect(screen.getByText("Unumkehrbar · GoBD § 146")).toBeTruthy();
    expect(screen.getByText("4 Spenden ohne Bescheinigung.")).toBeTruthy();
    const cta = screen.getByRole("button", {
      name: /2025 festschreiben/,
    }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("enables the fallback CTA once confirmed", () => {
    render(FestschreibungModal, {
      props: { open: true, year: 2025, facts, confirmed: true },
    });
    const cta = screen.getByRole("button", {
      name: /2025 festschreiben/,
    }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });
});
