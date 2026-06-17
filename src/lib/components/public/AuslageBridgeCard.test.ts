import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import AuslageBridgeCard from "./AuslageBridgeCard.svelte";

afterEach(() => cleanup());

describe("AuslageBridgeCard", () => {
  it("renders the outcome-first wording verbatim (spec §6 — binding)", () => {
    const { getByTestId } = render(AuslageBridgeCard);
    const card = getByTestId("auslage-bridge-card");
    expect(card.textContent).toContain("Geld ausgelegt?");
    expect(card.textContent).toContain(
      "Du hast etwas für den Verein bezahlt? Beleg hochladen und Erstattung bekommen — ohne Anmeldung. →",
    );
  });

  it("is one single link to /auslage-einreichen", () => {
    const { getByTestId } = render(AuslageBridgeCard);
    const card = getByTestId("auslage-bridge-card");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/auslage-einreichen");
  });
});
