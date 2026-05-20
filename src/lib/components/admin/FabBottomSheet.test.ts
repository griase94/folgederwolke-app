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
      screen.getByRole("menuitem", { name: /Auslage einreichen/i }),
    ).toBeTruthy();
  });

  it("each action links to its correct target", () => {
    render(FabBottomSheetTest, { props: { open: true } });

    const ausgabe = screen.getByRole("menuitem", { name: /Neue Ausgabe/i });
    const einnahme = screen.getByRole("menuitem", { name: /Neue Einnahme/i });
    const spende = screen.getByRole("menuitem", { name: /Neue Spende/i });
    const auslage = screen.getByRole("menuitem", {
      name: /Auslage einreichen/i,
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
});
