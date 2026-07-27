import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ReadinessCard from "./ReadinessCard.svelte";
import type { PreFlightListItem } from "./PreFlightList.svelte";

afterEach(() => cleanup());

const items: PreFlightListItem[] = [
  { id: "cat", label: "Alle 152 Buchungen kategorisiert", status: "pass" },
  { id: "beleg", label: "Belege vollständig", status: "pass" },
];

describe("ReadinessCard", () => {
  it("shows the head, count, ok callout, list and the Hub link", () => {
    render(ReadinessCard, {
      props: {
        passedCount: 5,
        totalCount: 6,
        callout: {
          tone: "ok",
          title: "2025 ist abschlussbereit.",
          sub: "Kein Blocker offen.",
        },
        items,
        linkHref: "/app/jahresabschluss",
      },
    });
    expect(screen.getByText("Abschluss-Bereitschaft")).toBeTruthy();
    expect(screen.getByText("5 / 6 ✓")).toBeTruthy();
    expect(screen.getByText("2025 ist abschlussbereit.")).toBeTruthy();
    expect(screen.getByText("Alle 152 Buchungen kategorisiert")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/app/jahresabschluss",
    );
  });

  it("renders the warn callout variant", () => {
    const { container } = render(ReadinessCard, {
      props: {
        passedCount: 4,
        totalCount: 6,
        callout: { tone: "warn", title: "Noch 2 Blocker offen." },
        items,
      },
    });
    expect(container.querySelector(".rc-callout.warn")).not.toBeNull();
  });
});
