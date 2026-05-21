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
    // Close the sheet at end of test so bits-ui body-scroll-lock teardown
    // fires while jsdom's document is still alive — otherwise vitest's
    // late timer flush hits `document is not defined`.
    await fireEvent.keyDown(document.body, { key: "Escape" });
  });

  it("nav has safe-area-inset-bottom padding so home indicator is respected", () => {
    const { container } = render(MobileTabBar);
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    // The documented utility (.nav-safe-bottom) is defined in app.css with
    // padding-bottom: env(safe-area-inset-bottom, 0px). Either the class
    // is applied OR the Tailwind arbitrary value `pb-[env(...)]` is — we
    // accept both forms so the assertion survives the C7-9 cleanup.
    const cls = nav!.className;
    expect(cls).toMatch(/(\bnav-safe-bottom\b|safe-area-inset-bottom)/);
  });

  // C7-9 cycle 2 — drop the redundant arbitrary value now that
  // .nav-safe-bottom is the documented utility. Having BOTH the class AND
  // pb-[env(safe-area-inset-bottom,0px)] is a smell and risks divergence.
  it("uses the .nav-safe-bottom utility class (C7-9)", () => {
    const { container } = render(MobileTabBar);
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    const cls = nav!.className;
    expect(cls).toMatch(/\bnav-safe-bottom\b/);
  });

  it("does NOT also carry the redundant pb-[env(...)] arbitrary value (C7-9)", () => {
    const { container } = render(MobileTabBar);
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    // The cleanup: when .nav-safe-bottom is applied, the arbitrary
    // `pb-[env(safe-area-inset-bottom...)` Tailwind class must NOT also be
    // present. One source of truth.
    expect(nav!.className).not.toMatch(/pb-\[env\(safe-area-inset-bottom/);
  });
});
