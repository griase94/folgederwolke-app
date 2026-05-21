/**
 * @phase-7 C7 — FAB bottom-sheet (PM-003)
 *
 * The mobile FAB opens a bottom sheet with 4 quick-add actions.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";

// $app/stores — FabBottomSheet (B-2) reads $page.data.formEnabled to gate
// the 4th "Externe Auslage einreichen" action. We back the mock with a
// writable so individual tests can flip formEnabled before render().
// Because vitest hoists vi.mock() above imports, the writable has to be
// constructed via vi.hoisted() so it exists when the mock factory runs.
const { _pageStore } = await vi.hoisted(async () => {
  const { writable: _writable } = await import("svelte/store");
  return {
    _pageStore: _writable<{ url: URL; data: { formEnabled: boolean } }>({
      url: new URL("http://localhost/app"),
      data: { formEnabled: true },
    }),
  };
});
vi.mock("$app/stores", () => ({
  page: _pageStore,
}));

import FabBottomSheetTest from "./FabBottomSheet.test.svelte";

afterEach(() => cleanup());

beforeEach(() => {
  // Reset $page.data.formEnabled to the default (true) before every test.
  _pageStore.set({
    url: new URL("http://localhost/app"),
    data: { formEnabled: true },
  });
});

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
    render(FabBottomSheetTest, { props: { open: true } });

    // Sheet portals its content to <body>, so we look up the menu items
    // via screen.getAllByRole (works across the document) rather than
    // querying the render container.
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.length).toBe(4);

    const iconSignatures = new Set<string>();
    for (const item of menuItems) {
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

  // ─── B-2 — Externe-Auslage form gate (PUBLIC_FORM_ENABLED) ────────
  it("hides the Externe Auslage action when $page.data.formEnabled is false (B-2)", () => {
    _pageStore.set({
      url: new URL("http://localhost/app"),
      data: { formEnabled: false },
    });
    render(FabBottomSheetTest, { props: { open: true } });

    // The first three actions still render
    expect(
      screen.getByRole("menuitem", { name: /Neue Ausgabe/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Neue Einnahme/i }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Neue Spende/i })).toBeTruthy();
    // Externe Auslage is gone
    expect(
      screen.queryByRole("menuitem", { name: /Externe Auslage einreichen/i }),
    ).toBeFalsy();
    // 3 menu items total — not 4
    expect(screen.getAllByRole("menuitem").length).toBe(3);
  });

  it("shows the Externe Auslage action when $page.data.formEnabled is true (B-2)", () => {
    _pageStore.set({
      url: new URL("http://localhost/app"),
      data: { formEnabled: true },
    });
    render(FabBottomSheetTest, { props: { open: true } });

    expect(
      screen.getByRole("menuitem", { name: /Externe Auslage einreichen/i }),
    ).toBeTruthy();
    expect(screen.getAllByRole("menuitem").length).toBe(4);
  });
});
