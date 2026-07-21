import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BescheinigungCard from "./BescheinigungCard.svelte";

afterEach(() => cleanup());

describe("BescheinigungCard", () => {
  it("ready: neutral head, pending id-chip, facts + checklist", () => {
    const { container } = render(BescheinigungCard, {
      props: {
        status: {
          tone: "neutral",
          title: "Noch nicht ausgestellt",
          sub: "Nummer wird beim Ausstellen vergeben",
        },
        idChip: { value: "B-2026-###", pending: true },
        facts: [
          { label: "Spender:in", value: "Ines Achleitner" },
          {
            label: "Betrag",
            value: "150,00 €",
            variant: "amount",
            tone: "spende",
          },
        ],
        checklist: [
          { ok: true, label: "Name & Anschrift der spendenden Person" },
        ],
      },
    });
    expect(screen.getByText("Noch nicht ausgestellt")).toBeTruthy();
    const chip = screen.getByTestId("id-chip");
    expect(chip.textContent).toContain("B-2026-###");
    expect(chip.classList.contains("pending")).toBe(true);
    expect(screen.getByText("Ines Achleitner")).toBeTruthy();
    expect(
      screen.getByText("Name & Anschrift der spendenden Person"),
    ).toBeTruthy();
    // neutral head tone attribute drives the spende-tinted icon chip
    expect(
      container.querySelector('.rc-statushead[data-tone="neutral"]'),
    ).not.toBeNull();
  });

  it("issued: ok head tone + issued id-chip", () => {
    const { container } = render(BescheinigungCard, {
      props: {
        status: {
          tone: "ok",
          title: "Ausgestellt",
          sub: "am 12.03.2026 · für Änderungen gesperrt",
        },
        idChip: { value: "B-2026-014", issued: true },
        callout: {
          tone: "ok",
          title: "Bescheinigung B-2026-014 ausgestellt",
          body: "Das PDF liegt im Datei-Archiv.",
        },
      },
    });
    expect(
      container.querySelector('.rc-statushead[data-tone="ok"]'),
    ).not.toBeNull();
    const chip = screen.getByTestId("id-chip");
    expect(chip.textContent).toContain("B-2026-014");
    expect(chip.classList.contains("pending")).toBe(false);
    expect(
      screen.getByText("Bescheinigung B-2026-014 ausgestellt"),
    ).toBeTruthy();
  });

  it("config-missing: warn head + warn callout", () => {
    const { container } = render(BescheinigungCard, {
      props: {
        status: { tone: "warn", title: "Ausstellen nicht möglich" },
        callout: {
          tone: "warn",
          title: "Freistellungsbescheid fehlt in den Einstellungen",
        },
      },
    });
    expect(
      container.querySelector('.rc-statushead[data-tone="warn"]'),
    ).not.toBeNull();
    expect(container.querySelector(".callout-warn")).not.toBeNull();
    expect(
      screen.getByText("Freistellungsbescheid fehlt in den Einstellungen"),
    ).toBeTruthy();
  });

  it("loading: renders the skeleton body, no facts/checklist", () => {
    const { container } = render(BescheinigungCard, {
      props: {
        status: { tone: "loading", title: "Vorschau wird geladen …" },
        loading: true,
        facts: [{ label: "x", value: "y" }],
      },
    });
    expect(container.querySelector(".skl")).not.toBeNull();
    // loading suppresses the data sections even if facts were passed
    expect(screen.queryByText("x")).toBeNull();
  });
});
