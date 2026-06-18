/**
 * Aurora — MonthGroup (master §2.4): shared month-grouping header.
 * Quiet net subtotal (signed, tabular); no subtotal → no amount element.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import MonthGroupHarness from "./MonthGroup.test.svelte";

afterEach(() => cleanup());

describe("MonthGroup", () => {
  it("renders the label as a group heading and the children", () => {
    render(MonthGroupHarness, { props: { label: "Mai 2026" } });
    expect(
      screen.getByRole("heading", { level: 2, name: "Mai 2026" }),
    ).toBeTruthy();
    expect(screen.getByTestId("group-row")).toBeTruthy();
  });

  it("renders a quiet signed subtotal when given", () => {
    render(MonthGroupHarness, {
      props: { label: "Mai 2026", subtotalCents: -12300 },
    });
    const sub = screen.getByTestId("month-subtotal");
    // Tolerate the ICU minus glyph (U+2212) as well as ASCII '-'.
    expect(sub.textContent).toMatch(/[-−]123,00/);
    expect(sub.className).toContain("tabular-nums");
    expect(sub.className).toContain("text-ink-500");
  });

  it("renders no subtotal element when subtotalCents is undefined", () => {
    render(MonthGroupHarness, { props: { label: "Mai 2026" } });
    expect(document.querySelector('[data-testid="month-subtotal"]')).toBeNull();
  });
});
