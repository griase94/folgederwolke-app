import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import YearCard from "./YearCard.svelte";
import type { YearCardPreFlightItem } from "./YearCard.svelte";

afterEach(() => cleanup());

const base = {
  year: 2025,
  einnahmenCents: 500000,
  ausgabenCents: 300000,
  ueberschussCents: 200000,
  buchungszahl: 8,
};

describe("YearCard", () => {
  it("ready: green accent card, Mini-EÜR, and the pre-flight checklist", () => {
    const items: YearCardPreFlightItem[] = [
      {
        id: "uncategorized",
        label: "Unkategorisierte Buchungen",
        status: "pass",
        detail: "Alle zugeordnet.",
      },
      {
        id: "draftInvoices",
        label: "Entwürfe von Rechnungen",
        status: "block",
        detail: "1 Entwurf offen.",
        fixHref: "/app/rechnungen?status=draft",
      },
    ];
    const { container } = render(YearCard, {
      props: { ...base, state: "ready", preFlightItems: items },
    });
    expect(container.querySelector(".ycard.is-ready")).not.toBeNull();
    expect(screen.getByText("Abschlussbereit")).toBeTruthy();
    expect(screen.getByText("Einnahmen")).toBeTruthy();
    expect(screen.getByText("Überschuss")).toBeTruthy();
    // a block item is red + carries its fix link
    expect(container.querySelector(".ck-item.block")).not.toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/app/rechnungen?status=draft",
    );
  });

  it("running: neutral statechip + the substats row", () => {
    const { container } = render(YearCard, {
      props: { ...base, year: 2026, state: "running" },
    });
    expect(container.querySelector(".ycard.is-ready")).toBeNull();
    expect(screen.getByText("läuft")).toBeTruthy();
    expect(screen.getByText("Saldo")).toBeTruthy();
    expect(screen.getByText("Buchungen")).toBeTruthy();
  });

  it("locked: compact row with the year, lock meta and the Überschuss", () => {
    const { container } = render(YearCard, {
      props: {
        ...base,
        year: 2024,
        state: "locked",
        lockedMeta: "festgeschrieben am 15.01.2025",
      },
    });
    expect(container.querySelector(".yc-locked")).not.toBeNull();
    expect(container.querySelector(".ycard")).toBeNull();
    expect(screen.getByText("festgeschrieben am 15.01.2025")).toBeTruthy();
    expect(screen.getByText("2024")).toBeTruthy();
  });
});
