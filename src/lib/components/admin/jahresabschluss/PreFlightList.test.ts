import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import PreFlightList from "./PreFlightList.svelte";
import type { PreFlightListItem } from "./PreFlightList.svelte";

afterEach(() => cleanup());

const items: PreFlightListItem[] = [
  { id: "cat", label: "Alle Buchungen kategorisiert", status: "pass" },
  {
    id: "beleg",
    label: "Fehlende Belege",
    status: "warn",
    detail: "2 ohne Beleg.",
    fixHref: "/app/ausgaben?belegFehlt=true",
  },
  {
    id: "draft",
    label: "Entwürfe von Rechnungen",
    status: "block",
    detail: "1 Entwurf.",
    fixHref: "/app/rechnungen?status=draft",
  },
];

describe("PreFlightList", () => {
  it("renders pass/warn/block with the right classes; block is red", () => {
    const { container } = render(PreFlightList, { props: { items } });
    expect(container.querySelector(".ck-item.pass")).not.toBeNull();
    expect(container.querySelector(".ck-item.warn")).not.toBeNull();
    expect(container.querySelector(".ck-item.block")).not.toBeNull();
  });

  it("shows a fix link on non-pass items only", () => {
    render(PreFlightList, { props: { items } });
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(2); // warn + block, not pass
    expect(links[0]!.getAttribute("href")).toBe(
      "/app/ausgaben?belegFehlt=true",
    );
  });
});
