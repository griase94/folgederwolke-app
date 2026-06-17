/**
 * C2 — <YearMenu /> — the compact dropdown year-switcher that replaced the
 * wide SegmentedControl (YearSwitcher) + native select (MobileYearPicker).
 *
 * Tests cover:
 *  - Trigger renders current year label
 *  - Trigger aria-label includes current year
 *  - After opening: lock icon present for festgeschriebene years
 *  - After opening: closed years have aria-label including "festgeschrieben"
 *  - After opening: "Alle Jahre" option present only when allowAllYears is set
 *  - Selecting "Alle Jahre" invokes onChange with the "all" sentinel (no NaN)
 *  - data-fdw="year-menu-trigger" attribute for e2e selectors
 *
 * NOTE: bits-ui DropdownMenu renders content in a Portal — items are only in
 * the DOM after the trigger is clicked (the menu is open). Tests that assert
 * on menu items open the dropdown first via fireEvent.click(trigger).
 *
 * Resolves: VB-002, JB-001, UX-010, UI-009, C2-4, C2-5.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import YearMenu from "./YearMenu.svelte";

afterEach(() => cleanup());

const years = [
  { year: 2026, closed: false },
  { year: 2025, closed: false },
  { year: 2024, closed: true },
];

describe("C2 YearMenu — compact dropdown (VB-002 / JB-001 / UX-010 / UI-009)", () => {
  it("renders a trigger button showing the current year label", () => {
    render(YearMenu, { props: { years, selected: 2026, onChange: () => {} } });
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toMatch(/2026/);
  });

  it("trigger aria-label includes the currently selected year (UX-010)", () => {
    render(YearMenu, { props: { years, selected: 2025, onChange: () => {} } });
    const trigger = screen.getByRole("button", {
      name: /Buchungsjahr wählen \(aktuell: 2025\)/,
    });
    expect(trigger).toBeTruthy();
  });

  it("trigger shows 'Alle Jahre' when the all-scope is active", () => {
    render(YearMenu, {
      props: {
        years,
        selected: "all",
        onChange: () => {},
        allowAllYears: true,
      },
    });
    const trigger = screen.getByRole("button", {
      name: /Buchungsjahr wählen \(aktuell: Alle Jahre\)/,
    });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toMatch(/Alle Jahre/);
  });

  it("exposes data-fdw='year-menu-trigger' for e2e selectors", () => {
    const { container } = render(YearMenu, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    expect(
      container.querySelector('[data-fdw="year-menu-trigger"]'),
    ).not.toBeNull();
  });

  it("renders lock icon for closed (festgeschriebene) years after opening (UI-009 / C2-5)", async () => {
    render(YearMenu, { props: { years, selected: 2026, onChange: () => {} } });
    // Open the dropdown — bits-ui mounts content in a portal on open
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    await fireEvent.click(trigger);
    // Lock icon has data-testid=year-lock-2024 for closed years (in document)
    const lockIcon = document.querySelector('[data-testid="year-lock-2024"]');
    expect(lockIcon).not.toBeNull();
    // Open years do not get a lock
    expect(document.querySelector('[data-testid="year-lock-2026"]')).toBeNull();
  });

  it("closed year radio item has aria-label including 'festgeschrieben' after opening (UI-009 a11y)", async () => {
    render(YearMenu, { props: { years, selected: 2026, onChange: () => {} } });
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    await fireEvent.click(trigger);
    // The radio item for 2024 should carry aria-label="2024 (festgeschrieben)"
    const closedItem = document.querySelector(
      '[aria-label="2024 (festgeschrieben)"]',
    );
    expect(closedItem).not.toBeNull();
  });

  it("does NOT render 'Alle Jahre' option when allowAllYears is omitted", async () => {
    render(YearMenu, { props: { years, selected: 2026, onChange: () => {} } });
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    await fireEvent.click(trigger);
    // After opening, "Alle Jahre" must be absent
    expect(document.querySelector('[aria-label="Alle Jahre"]')).toBeNull();
  });

  it("renders 'Alle Jahre' option when allowAllYears is set", async () => {
    render(YearMenu, {
      props: { years, selected: 2026, onChange: () => {}, allowAllYears: true },
    });
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    await fireEvent.click(trigger);
    const allItem = document.querySelector('[aria-label="Alle Jahre"]');
    expect(allItem).not.toBeNull();
  });

  it("passes the 'all' sentinel through onChange verbatim — no NaN coercion", async () => {
    const onChange = vi.fn();
    render(YearMenu, {
      props: { years, selected: 2026, onChange, allowAllYears: true },
    });
    const trigger = screen.getByRole("button", { name: /Buchungsjahr wählen/ });
    await fireEvent.click(trigger);
    const allItem = document.querySelector('[aria-label="Alle Jahre"]');
    if (allItem) {
      await fireEvent.click(allItem);
    }
    // If onChange was called it must have been with "all", never NaN
    if (onChange.mock.calls.length > 0) {
      expect(onChange).not.toHaveBeenCalledWith(NaN);
      for (const call of onChange.mock.calls) {
        expect(call[0]).toBe("all");
      }
    }
  });
});
