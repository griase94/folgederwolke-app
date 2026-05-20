/**
 * C2 cycle 3 — <MobileYearPicker /> — the `<sm` native-select alternative
 * to the SegmentedControl YearSwitcher. Resolves C2-4 (julia P1 + UX-1
 * blocker: no way to switch years on iPhone width).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import MobileYearPicker from "./MobileYearPicker.svelte";

afterEach(() => cleanup());

const years = [
  { year: 2026, closed: false },
  { year: 2025, closed: false },
  { year: 2024, closed: true },
];

describe("C2 MobileYearPicker (C2-4)", () => {
  it("renders a native <select> with one <option> per year", () => {
    render(MobileYearPicker, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    const select = screen.getByRole("combobox", { name: "Buchungsjahr" });
    expect(select).toBeTruthy();
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(3);
  });

  it("marks the selected year as the current value", () => {
    render(MobileYearPicker, {
      props: { years, selected: 2025, onChange: () => {} },
    });
    const select = screen.getByRole("combobox", {
      name: "Buchungsjahr",
    }) as HTMLSelectElement;
    expect(select.value).toBe("2025");
  });

  it("invokes onChange with the new year on change", async () => {
    const onChange = vi.fn();
    render(MobileYearPicker, { props: { years, selected: 2026, onChange } });
    const select = screen.getByRole("combobox", {
      name: "Buchungsjahr",
    }) as HTMLSelectElement;
    select.value = "2025";
    await fireEvent.change(select);
    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it("flags closed years with a lock + 'festgeschrieben' in the option label", () => {
    render(MobileYearPicker, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    const select = screen.getByRole("combobox", {
      name: "Buchungsjahr",
    }) as HTMLSelectElement;
    const closedOption = Array.from(select.options).find(
      (o) => o.value === "2024",
    );
    expect(closedOption).toBeTruthy();
    // U+1F512 = 🔒, the lock-character prefix on closed-year option labels.
    expect(closedOption!.textContent).toMatch(/\u{1F512}/u);
    expect(closedOption!.textContent).toMatch(/festgeschrieben/i);
    // Open years don't get the lock prefix.
    const openOption = Array.from(select.options).find(
      (o) => o.value === "2026",
    );
    expect(openOption!.textContent).not.toMatch(/\u{1F512}/u);
  });

  it("exposes the picker via data-fdw='year-switcher-mobile' for e2e selectors", () => {
    const { container } = render(MobileYearPicker, {
      props: { years, selected: 2026, onChange: () => {} },
    });
    expect(
      container.querySelector('[data-fdw="year-switcher-mobile"]'),
    ).not.toBeNull();
  });
});
