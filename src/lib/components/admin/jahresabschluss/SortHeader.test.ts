import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import SortHeader from "./SortHeader.svelte";
import type { SortColumn } from "./SortHeader.svelte";

afterEach(() => cleanup());

const columns: SortColumn[] = [
  { key: "date", label: "Datum" },
  { key: "bezeichnung", label: "Bezeichnung", sortable: false },
  { key: "betrag", label: "Betrag", num: true },
];

const hrefFor = (key: string, dir: string) => `?sort=${key}-${dir}`;

describe("SortHeader", () => {
  it("renders sortable links + a static (non-link) column", () => {
    render(SortHeader, {
      props: { columns, cols: "1fr 2fr 120px", hrefFor },
    });
    const links = screen.getAllByRole("columnheader");
    expect(links.length).toBe(3);
    // static column is not an anchor
    const bez = screen.getByText("Bezeichnung");
    expect(bez.tagName).toBe("SPAN");
    expect(bez.classList.contains("static")).toBe(true);
  });

  it("marks the active column with aria-sort and flips its next-sort href", () => {
    render(SortHeader, {
      props: {
        columns,
        cols: "1fr 2fr 120px",
        activeKey: "date",
        activeDir: "desc",
        hrefFor,
      },
    });
    const dateCol = screen.getByText("Datum").closest("a")!;
    expect(dateCol.getAttribute("aria-sort")).toBe("descending");
    // clicking the active desc column flips to asc
    expect(dateCol.getAttribute("href")).toBe("?sort=date-asc");
    // a fresh column starts at desc
    const betragCol = screen.getByText("Betrag").closest("a")!;
    expect(betragCol.getAttribute("aria-sort")).toBe("none");
    expect(betragCol.getAttribute("href")).toBe("?sort=betrag-desc");
  });
});
