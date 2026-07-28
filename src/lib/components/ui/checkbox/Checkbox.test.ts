/**
 * Checkbox — the Aurora selection checkbox (sr-only native input + styled
 * surrogate box). Asserts native semantics survive the surrogate: role,
 * checked reflection, click→toggle→onchange, the disabled gate, data-testid
 * forwarding, and the aria-label wrapper for label-less (icon-only) use.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import { Checkbox } from "./index.js";

afterEach(() => cleanup());

describe("Checkbox", () => {
  it("renders an accessible checkbox, unchecked by default (no tick)", () => {
    const { container } = render(Checkbox, {
      props: { label: "Zeile auswählen" },
    });
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    // The surrogate tick (lucide Check <svg>) is absent when unchecked.
    expect(container.querySelector("svg")).toBeNull();
  });

  it("checked=true reflects on the input and shows the tick", () => {
    const { container } = render(Checkbox, {
      props: { checked: true, label: "x" },
    });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("click toggles the input and fires onchange", async () => {
    const onchange = vi.fn();
    render(Checkbox, { props: { checked: false, label: "x", onchange } });
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    await fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(onchange).toHaveBeenCalledTimes(1);
  });

  it("disabled blocks the toggle and suppresses onchange", async () => {
    const onchange = vi.fn();
    render(Checkbox, {
      props: { checked: false, disabled: true, label: "x", onchange },
    });
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    await fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(onchange).not.toHaveBeenCalled();
  });

  it("forwards data-testid to the underlying input", () => {
    render(Checkbox, {
      props: { label: "x", "data-testid": "member-row-select" },
    });
    expect(screen.getByTestId("member-row-select").tagName).toBe("INPUT");
  });

  it("carries the `label` as the wrapper aria-label for icon-only selection", () => {
    const { container } = render(Checkbox, {
      props: { label: "Anna Fixture auswählen" },
    });
    expect(container.querySelector("label")?.getAttribute("aria-label")).toBe(
      "Anna Fixture auswählen",
    );
  });
});
