/**
 * @phase-3 CellPopover — the anchored-surface shell (modal-member-popovers §4).
 *
 * A pure re-composition of the bits-ui Popover (≥ sm) / ui-Sheet (< sm) twin that
 * MarkPaidControl and MemberMatrix each carried inline. These tests pin the shell
 * contract: the desktop popover portals its body when open (controlled mode, as
 * the matrix uses it), the < sm branch presents a bottom Sheet with an sr-only
 * accessible title, and closing hides the body. The rich content behaviour lives
 * in BeitragCellDialog.test.ts.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import CellPopover from "./CellPopover.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const body = createRawSnippet(() => ({
  render: () => `<p data-testid="cp-body">Inhalt</p>`,
}));

/** Stub matchMedia so the shell picks the requested branch deterministically. */
function stubViewport(isMobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: isMobile,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("CellPopover — desktop popover (controlled)", () => {
  it("portals the body inside the anchored popover when open", () => {
    stubViewport(false);
    render(CellPopover, {
      props: { open: true, title: "Erika · 2026", children: body },
    });
    const surface = screen.getByTestId("cell-popover");
    expect(surface).toBeTruthy();
    expect(screen.getByTestId("cp-body")).toBeTruthy();
  });

  it("does not render the body when closed", () => {
    stubViewport(false);
    render(CellPopover, {
      props: { open: false, title: "Erika · 2026", children: body },
    });
    expect(screen.queryByTestId("cp-body")).toBeNull();
  });

  it("honours a custom popover testid", () => {
    stubViewport(false);
    render(CellPopover, {
      props: {
        open: true,
        title: "T",
        popoverTestId: "matrix-cell-popover",
        children: body,
      },
    });
    expect(screen.getByTestId("matrix-cell-popover")).toBeTruthy();
  });
});

describe("CellPopover — mobile sheet (< sm)", () => {
  it("presents a bottom Sheet with an sr-only accessible title", () => {
    stubViewport(true);
    render(CellPopover, {
      props: {
        open: true,
        title: "Erika · 2026 · Beitrag bearbeiten",
        children: body,
      },
    });
    expect(screen.getByTestId("cell-sheet")).toBeTruthy();
    expect(screen.getByTestId("cp-body")).toBeTruthy();
    // The Sheet.Title is the dialog's accessible name (sr-only, not visually shown).
    expect(screen.getByText("Erika · 2026 · Beitrag bearbeiten")).toBeTruthy();
  });
});
