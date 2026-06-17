/**
 * Aurora slice 2 — ⊕ type-chooser sheet (spec §5): exactly three tiles
 * (Ausgabe / Einnahme / Spende) → existing create routes, navigation via
 * replaceState (history entry consumed).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// vi.mock() is hoisted above imports by vitest, so mockPage must be created
// via vi.hoisted() to be available when the factory runs.
const mockPage = vi.hoisted(() => ({
  url: new URL("http://localhost/app"),
  data: {} as Record<string, unknown>,
  state: { createSheet: true } as Record<string, unknown>,
}));

vi.mock("$app/state", () => ({ page: mockPage }));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), pushState: vi.fn() }));

import CreateSheet from "./CreateSheet.svelte";
import { goto } from "$app/navigation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockPage.state = { createSheet: true };
});

describe("CreateSheet", () => {
  it("renders the title and exactly the three type tiles", () => {
    render(CreateSheet);
    expect(screen.getByText("Neu erfassen")).toBeTruthy();
    const tiles = [...document.querySelectorAll('[data-testid="create-tile"]')];
    expect(tiles.map((t) => t.textContent?.trim())).toEqual([
      "Ausgabe",
      "Einnahme",
      "Spende",
    ]);
  });

  it("tiles target the existing per-type create routes", () => {
    render(CreateSheet);
    const hrefs = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="create-tile"]',
      ),
    ].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/app/ausgaben/neu",
      "/app/einnahmen/neu",
      "/app/spenden/neu",
    ]);
  });

  it("tile tap navigates with replaceState", async () => {
    render(CreateSheet);
    const spende = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="create-tile"]',
      ),
    ][2]!;
    await fireEvent.click(spende);
    expect(goto).toHaveBeenCalledWith("/app/spenden/neu", {
      replaceState: true,
    });
  });

  it("renders nothing when page.state.createSheet is unset", () => {
    mockPage.state = {};
    render(CreateSheet);
    expect(document.querySelector('[data-testid="create-tile"]')).toBeNull();
  });
});
