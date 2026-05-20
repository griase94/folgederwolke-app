/**
 * @phase-7 C7 — MobileTabBar / FAB wiring (PM-003)
 *
 * Verifies that the "Neu" FAB is no longer disabled, has the expected
 * a11y attributes, and is a real button (so we can attach a click handler
 * that opens the FabBottomSheet).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import { readable } from "svelte/store";

// Stub $app/stores — the bare component pulls $page for active-tab logic.
vi.mock("$app/stores", () => ({
  page: readable({ url: new URL("http://localhost/app") }),
}));

import MobileTabBar from "./MobileTabBar.svelte";

afterEach(() => cleanup());

describe("MobileTabBar — FAB", () => {
  it('renders a "Neu erfassen" button that is NOT disabled', () => {
    render(MobileTabBar);
    const fab = screen.getByRole("button", { name: /Neu erfassen/i });
    expect(fab).toBeTruthy();
    expect((fab as HTMLButtonElement).disabled).toBe(false);
  });

  it("FAB exposes aria-haspopup=menu", () => {
    render(MobileTabBar);
    const fab = screen.getByRole("button", { name: /Neu erfassen/i });
    expect(fab.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("clicking the FAB opens the sheet (aria-expanded flips to true)", async () => {
    render(MobileTabBar);
    const fab = screen.getByRole("button", { name: /Neu erfassen/i });
    expect(fab.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(fab);
    expect(fab.getAttribute("aria-expanded")).toBe("true");
  });

  it("nav has safe-area-inset-bottom padding so home indicator is respected", () => {
    const { container } = render(MobileTabBar);
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    // Tailwind arbitrary value applied as a class — verifies we kept the inset.
    const cls = nav!.className;
    expect(cls).toMatch(/safe-area-inset-bottom/);
  });
});
