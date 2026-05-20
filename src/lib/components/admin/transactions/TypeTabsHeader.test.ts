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
