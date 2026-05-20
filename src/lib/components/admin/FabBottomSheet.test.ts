/**
 * @phase-7 C7 — FAB bottom-sheet (PM-003)
 *
 * The mobile FAB opens a bottom sheet with 4 quick-add actions.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import FabBottomSheetTest from "./FabBottomSheet.test.svelte";

afterEach(() => cleanup());

describe("FabBottomSheet", () => {
  it("renders all four quick-add actions when open=true", () => {
    render(FabBottomSheetTest, { props: { open: true } });

    // The four actions
    expect(
      screen.getByRole("menuitem", { name: /Neue Ausgabe/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Neue Einnahme/i }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Neue Spende/i })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Externe Auslage einreichen/i }),
    ).toBeTruthy();
  });

  it("each action links to its correct target", () => {
    render(FabBottomSheetTest, { props: { open: true } });

    const ausgabe = screen.getByRole("menuitem", { name: /Neue Ausgabe/i });
    const einnahme = screen.getByRole("menuitem", { name: /Neue Einnahme/i });
    const spende = screen.getByRole("menuitem", { name: /Neue Spende/i });
    const auslage = screen.getByRole("menuitem", {
      name: /Externe Auslage einreichen/i,
    });

    expect(ausgabe.getAttribute("href")).toBe(
      "/app/transactions/neu?kind=ausgabe",
    );
    expect(einnahme.getAttribute("href")).toBe(
      "/app/transactions/neu?kind=einnahme",
    );
    expect(spende.getAttribute("href")).toBe(
      "/app/transactions/neu?kind=spende",
    );
    expect(auslage.getAttribute("href")).toBe("/auslage-einreichen");
  });

  it("does not render menu items when open=false", () => {
    render(FabBottomSheetTest, { props: { open: false } });
    expect(
      screen.queryByRole("menuitem", { name: /Neue Ausgabe/i }),
    ).toBeFalsy();
  });

  it("sheet has an accessible title for screen readers", () => {
    render(FabBottomSheetTest, { props: { open: true } });
    // The sheet's title — describes the menu purpose
    expect(screen.getByText(/Neu erfassen/i)).toBeTruthy();
  });

  // ─── C7-4 cycle 2 — relabel external-expense item ──────────────────
  it('the "Auslage einreichen" item is relabelled as "Externe Auslage einreichen" (C7-4)', () => {
    render(FabBottomSheetTest, { props: { open: true } });

    // The new label disambiguates from an admin-side "Neue Ausgabe" entry —
    // tapping this one routes to the public outsider form.
    expect(
      screen.getByRole("menuitem", { name: /Externe Auslage einreichen/i }),
    ).toBeTruthy();
    // The hint still describes the public-form intent.
    expect(screen.getByText(/öffentliches Formular/i)).toBeTruthy();
  });

  // ─── C7-6 cycle 2 — distinct icons per action ─────────────────────
  it("each action renders a distinct icon (no shared placeholder) (C7-6)", () => {
    const { container } = render(FabBottomSheetTest, {
      props: { open: true },
    });

    // Each menu item must contain its own SVG. Collect all <svg> elements
    // INSIDE the menu items (not the chevron suffix), then verify the
    // inner-HTML markup differs across all four — the cluster-finding asks
    // for unique iconography.
    const menuItems = container.querySelectorAll('[role="menuitem"]');
    expect(menuItems.length).toBe(4);

    const iconSignatures = new Set<string>();
    for (const item of Array.from(menuItems)) {
      // The leading icon lives in the first `aria-hidden` span — its <svg>
      // content is what differentiates the actions.
      const iconHost = item.querySelector('[aria-hidden="true"]');
      expect(iconHost).toBeTruthy();
      // Normalise whitespace so subtle formatting changes don't break the
      // distinctness check.
      const sig = (iconHost?.innerHTML ?? "").replace(/\s+/g, " ").trim();
      iconSignatures.add(sig);
    }

    // 4 menu items, 4 distinct icon DOM signatures.
    expect(iconSignatures.size).toBe(4);
  });
});
