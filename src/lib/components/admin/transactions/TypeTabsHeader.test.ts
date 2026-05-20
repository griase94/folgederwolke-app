/**
 * @phase-7 C7 — TypeTabsHeader filter chip overflow (PM-008)
 *
 * The 4 chips ("Alle / Ausgaben / Einnahmen / Spenden") must not clip the
 * viewport at 390px. We verify the structure: tablist is overflow-x-auto,
 * each tab is shrink-0 + whitespace-nowrap so chips don't crush.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import TypeTabsHeader from "./TypeTabsHeader.svelte";

afterEach(() => cleanup());

describe("TypeTabsHeader — overflow safety (PM-008)", () => {
  it("tablist container has overflow-x-auto for horizontal scroll", () => {
    const { container } = render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 0, income: 0, donation: 0 },
        onchange: () => {},
      },
    });
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    expect(tablist!.className).toMatch(/overflow-x-auto/);
  });

  it("each tab is shrink-0 + whitespace-nowrap so chips don't crush", () => {
    render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 0, income: 0, donation: 0 },
        onchange: () => {},
      },
    });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(4);
    for (const tab of tabs) {
      expect(tab.className).toMatch(/shrink-0/);
      expect(tab.className).toMatch(/whitespace-nowrap/);
    }
  });

  // ── C7-5 cycle 2 — scroll-snap so chips land at predictable rest points,
  // plus a right-edge fade mask so users sense there's more content to
  // scroll to at 390px. ─────────────────────────────────────────────────
  it("tablist has scroll-snap-x for predictable rest points (C7-5)", () => {
    const { container } = render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 0, income: 0, donation: 0 },
        onchange: () => {},
      },
    });
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    // Either Tailwind's `snap-x` utility OR the explicit
    // `[scroll-snap-type:x_mandatory]` arbitrary form.
    expect(tablist!.className).toMatch(/snap-x|scroll-snap-type/);
  });

  it("each tab opts into snap-align so it stops cleanly (C7-5)", () => {
    render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 0, income: 0, donation: 0 },
        onchange: () => {},
      },
    });
    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      expect(tab.className).toMatch(/snap-(start|center|align)/);
    }
  });

  it("tablist has an edge-fade mask hint (mask-image / fade gradient) (C7-5)", () => {
    const { container } = render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 0, income: 0, donation: 0 },
        onchange: () => {},
      },
    });
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
    // Either Tailwind's `mask-` shortcut OR the arbitrary `[mask-image:...]`.
    expect(tablist!.className).toMatch(/mask-(image|linear)|mask-\[/);
  });

  it("renders all four type tabs even when label is long", () => {
    render(TypeTabsHeader, {
      props: {
        activeKind: undefined,
        counts: { expense: 9999, income: 9999, donation: 9999 },
        onchange: () => {},
      },
    });
    expect(screen.getByRole("tab", { name: /Alle/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Ausgaben/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Einnahmen/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Spenden/i })).toBeTruthy();
  });
});
