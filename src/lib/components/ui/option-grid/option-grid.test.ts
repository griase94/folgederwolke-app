/**
 * OptionGrid — the radio grid of mutually exclusive presets (A-S3.3).
 *
 * The point of the component is that it did NOT re-implement radio behaviour:
 * these tests pin the native substrate (real inputs, one shared name, one
 * checked at a time), because that substrate is what buys arrow-key navigation
 * and the single tab stop for free.
 */
import { render, cleanup, screen } from "@testing-library/svelte";
import { describe, it, expect, afterEach, vi } from "vitest";
import OptionGrid from "./OptionGrid.svelte";

afterEach(() => cleanup());

const options = [
  { value: "a", label: "Beleg unleserlich" },
  { value: "b", label: "Doppelte Einreichung" },
  { value: "z", label: "Sonstiges", full: true },
];

describe("OptionGrid", () => {
  it("renders one native radio per option under a single group name", () => {
    const { container } = render(OptionGrid, {
      props: { options, value: "a", legend: "Grund-Vorlage", name: "tpl" },
    });
    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    expect(radios).toHaveLength(3);
    expect([...radios].every((r) => r.name === "tpl")).toBe(true);
    // Exactly one checked — the one `value` points at.
    expect([...radios].filter((r) => r.checked).map((r) => r.value)).toEqual([
      "a",
    ]);
  });

  it("labels the group and every option", () => {
    render(OptionGrid, {
      props: { options, value: "a", legend: "Grund-Vorlage" },
    });
    expect(screen.getByText("Grund-Vorlage")).toBeTruthy();
    expect(screen.getByText("Doppelte Einreichung")).toBeTruthy();
  });

  it("reports a user pick through onselect", async () => {
    const onselect = vi.fn();
    render(OptionGrid, {
      props: { options, value: "a", legend: "Grund", onselect },
    });
    const second = screen
      .getByTestId("option-grid-b")
      .querySelector<HTMLInputElement>("input")!;
    second.click();
    expect(onselect).toHaveBeenCalledWith("b");
  });

  it("marks the selected card for styling and for tests", () => {
    render(OptionGrid, {
      props: { options, value: "b", legend: "Grund" },
    });
    expect(screen.getByTestId("option-grid-b").dataset["selected"]).toBe("");
    expect(screen.getByTestId("option-grid-a").dataset["selected"]).toBe(
      undefined,
    );
  });

  it("spans a `full` option across the row instead of pairing it", () => {
    render(OptionGrid, { props: { options, value: "a", legend: "Grund" } });
    expect(screen.getByTestId("option-grid-z").className).toContain(
      "sm:col-span-2",
    );
    expect(screen.getByTestId("option-grid-a").className).not.toContain(
      "sm:col-span-2",
    );
  });

  it("keeps the mobile touch target at the 44px floor", () => {
    render(OptionGrid, { props: { options, value: "a", legend: "Grund" } });
    const card = screen.getByTestId("option-grid-a").className;
    expect(card).toContain("min-h-11");
    expect(card).toContain("md:min-h-10");
  });
});
