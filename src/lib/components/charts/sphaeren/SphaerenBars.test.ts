import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import SphaerenBars from "./SphaerenBars.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

const rows = [
  { sphere: "ideeller" as const, cents: 824000 },
  { sphere: "zweckbetrieb" as const, cents: 398000 },
  { sphere: "vermoegen" as const, cents: 112000 },
  { sphere: "wirtschaftlich" as const, cents: -52000 },
];

describe("SphaerenBars", () => {
  it("full variant renders sorted bars + a sr-only table with shares", () => {
    render(SphaerenBars, { props: { rows } });
    expect(screen.getByTestId("sphaeren-bars")).toBeTruthy();
    const tbody = screen.getByTestId("sphaeren-table").querySelector("tbody")!;
    expect(tbody.querySelectorAll("tr")).toHaveLength(4);
    // deficit sphere prints a real minus
    expect(tbody.textContent).toMatch(/−/);
  });

  it("dense variant prints every sphere row with betrag + share", () => {
    render(SphaerenBars, { props: { rows, dense: true } });
    expect(screen.getByTestId("sphaeren-bars-dense")).toBeTruthy();
    expect(
      nb(screen.getByTestId("sphaere-row-ideeller").textContent),
    ).toContain("8.240 €");
    expect(
      screen.getByTestId("sphaere-row-wirtschaftlich").textContent,
    ).toMatch(/−/);
  });
});
