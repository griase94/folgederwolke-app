/**
 * Aurora — FilterChips (master §2.5 frozen contract): ≥44px hit area,
 * solid primary-strong active fill + aria-current, ?param= via goto
 * keepFocus. Behavioral law: the empty-value chip ("Alle") DELETES the
 * param; ANY chip change deletes ?page= (pagination reset).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// vi.hoisted() — object must exist before the vi.mock() factory runs (hoisting).
const mockPage = vi.hoisted(() => ({
  url: new URL(
    "http://localhost/app/transaktionen?typ=ausgaben&year=2026&page=3",
  ),
  data: {} as Record<string, unknown>,
  state: {} as Record<string, unknown>,
}));

vi.mock("$app/state", () => ({ page: mockPage }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import FilterChips from "./FilterChips.svelte";
import { goto } from "$app/navigation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockPage.url = new URL(
    "http://localhost/app/transaktionen?typ=ausgaben&year=2026&page=3",
  );
});

const OPTIONS = [
  { value: "", label: "Alle" },
  { value: "ausgaben", label: "Ausgaben" },
  { value: "einnahmen", label: "Einnahmen" },
  { value: "spenden", label: "Spenden" },
];

describe("FilterChips", () => {
  it("renders one button per option with ≥44px hit area and stable testids", () => {
    render(FilterChips, {
      props: { options: OPTIONS, active: "", paramName: "typ" },
    });
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(4);
    for (const b of buttons) expect(b.className).toContain("min-h-11");
    expect(screen.getByTestId("filter-chip-alle")).toBeTruthy();
    expect(screen.getByTestId("filter-chip-spenden")).toBeTruthy();
  });

  it("active chip: solid primary-strong fill, white text, aria-current", () => {
    render(FilterChips, {
      props: { options: OPTIONS, active: "ausgaben", paramName: "typ" },
    });
    const active = screen.getByRole("button", { name: "Ausgaben" });
    expect(active.getAttribute("aria-current")).toBe("true");
    const visual = active.querySelector("span")!;
    expect(visual.className).toContain("bg-primary-strong");
    expect(visual.className).toContain("text-white");
    const inactive = screen.getByRole("button", { name: "Alle" });
    expect(inactive.getAttribute("aria-current")).toBeNull();
    expect(inactive.querySelector("span")!.className).toContain(
      "border-hairline",
    );
  });

  it("click writes ?{paramName}= via goto keepFocus, preserves other params, deletes ?page=", async () => {
    render(FilterChips, {
      props: { options: OPTIONS, active: "ausgaben", paramName: "typ" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Spenden" }));
    expect(goto).toHaveBeenCalledWith(
      "/app/transaktionen?typ=spenden&year=2026",
      {
        keepFocus: true,
        noScroll: true,
      },
    );
  });

  it('the empty-value chip ("Alle") DELETES the param — and still deletes ?page=', async () => {
    render(FilterChips, {
      props: { options: OPTIONS, active: "ausgaben", paramName: "typ" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Alle" }));
    expect(goto).toHaveBeenCalledWith("/app/transaktionen?year=2026", {
      keepFocus: true,
      noScroll: true,
    });
  });
});
