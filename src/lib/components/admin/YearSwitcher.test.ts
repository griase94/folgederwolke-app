/**
 * C2 — <YearSwitcher /> — the topbar segmented control that swaps
 * `?year=NNNN` on every list/dashboard route. Built on top of the C6
 * <SegmentedControl/> primitive — must not reintroduce a one-off pill
 * pattern (UI-043).
 *
 * Resolves: VB-002, JB-001, UX-010, UI-009, UI-043.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import YearSwitcher from "./YearSwitcher.svelte";

afterEach(() => cleanup());

const years = [
  { year: 2026, closed: false },
  { year: 2025, closed: false },
  { year: 2024, closed: true },
];

describe("C2 YearSwitcher (VB-002 / JB-001 / UX-010 / UI-009 / UI-043)", () => {
  it("renders a radiogroup with one radio per year", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio").length).toBe(3);
  });

  it("marks the selected year aria-checked=true (UX-010 — year is no longer implicit)", () => {
    render(YearSwitcher, {
      props: { years, selected: 2025, onChange: () => {} },
    });
    const r2025 = screen.getByRole("radio", { name: /2025/ });
    const r2026 = screen.getByRole("radio", { name: /2026/ });
    expect(r2025.getAttribute("aria-checked")).toBe("true");
    expect(r2026.getAttribute("aria-checked")).toBe("false");
  });

  it("invokes onChange with the new year on click (JB-001)", async () => {
    const onChange = vi.fn();
    render(YearSwitcher, { props: { years, selected: 2026, onChange } });
    await fireEvent.click(screen.getByRole("radio", { name: /2025/ }));
    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it("renders a lock icon for closed (festgeschriebene) years (UI-009)", () => {
    const { container } = render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    // Lock icon is rendered with data-testid=year-lock-2024 for closed years
    const lockIcon = container.querySelector('[data-testid="year-lock-2024"]');
    expect(lockIcon).not.toBeNull();
    // Open years do not get a lock
    expect(
      container.querySelector('[data-testid="year-lock-2026"]'),
    ).toBeNull();
  });

  it("lock icon is rendered INSIDE the segment for each closed year (C2-5)", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    // The closed-year radio button (segment) must contain the lock icon as a
    // descendant — sighted users learn from the icon position WHICH year is
    // festgeschrieben, not from a generic cluster at the end of the switcher.
    const closedRadio = screen.getByRole("radio", {
      name: /2024.*festgeschrieben/i,
    });
    const lockIcon = closedRadio.querySelector(
      '[data-testid="year-lock-2024"]',
    );
    expect(lockIcon).not.toBeNull();
    // Open year segments must not contain a lock icon.
    const openRadio = screen.getByRole("radio", { name: /^2026$/ });
    expect(openRadio.querySelector('[data-testid^="year-lock-"]')).toBeNull();
  });

  it("exposes accessible name including 'festgeschrieben' on closed years (UI-009)", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    const closed = screen.getByRole("radio", {
      name: /2024.*festgeschrieben/i,
    });
    expect(closed).toBeTruthy();
  });

  it("still calls onChange when a closed year is clicked (closed = read-only, navigable)", async () => {
    // Closed years are READABLE — the user can switch into them to view the
    // EÜR, just not mutate. The DB trigger refuses writes (ADR-0006); the
    // switcher must not block navigation.
    const onChange = vi.fn();
    render(YearSwitcher, { props: { years, selected: 2026, onChange } });
    await fireEvent.click(screen.getByRole("radio", { name: /2024/ }));
    expect(onChange).toHaveBeenCalledWith(2024);
  });

  it("renders the radio group with an aria-label='Buchungsjahr'", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    const group = screen.getByRole("radiogroup", { name: "Buchungsjahr" });
    expect(group).toBeTruthy();
  });

  // ── Task 3: "Alle Jahre" lists-only scope ─────────────────────────────────

  it("appends an 'Alle Jahre' option only when allowAllYears is set", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {}, allowAllYears: true },
    });
    // 3 years + the Alle Jahre segment = 4 radios.
    expect(screen.getAllByRole("radio").length).toBe(4);
    expect(screen.getByRole("radio", { name: /Alle Jahre/ })).toBeTruthy();
  });

  it("does NOT render 'Alle Jahre' by default (allowAllYears omitted)", () => {
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    expect(screen.queryByRole("radio", { name: /Alle Jahre/ })).toBeNull();
  });

  it("highlights 'Alle Jahre' as active when selected is the 'all' sentinel", () => {
    render(YearSwitcher, {
      props: {
        years,
        selected: "all",
        onChange: () => {},
        allowAllYears: true,
      },
    });
    const allOption = screen.getByRole("radio", { name: /Alle Jahre/ });
    expect(allOption.getAttribute("aria-checked")).toBe("true");
    // The concrete years are not checked when the scope is "all".
    expect(
      screen
        .getByRole("radio", { name: /^2026$/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("passes the 'all' sentinel through onChange verbatim (no NaN coercion)", async () => {
    const onChange = vi.fn();
    render(YearSwitcher, {
      props: { years, selected: 2026, onChange, allowAllYears: true },
    });
    await fireEvent.click(screen.getByRole("radio", { name: /Alle Jahre/ }));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});
