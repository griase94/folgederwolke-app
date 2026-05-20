import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import SegmentedControl from "./segmented-control.svelte";

afterEach(() => cleanup());

const options = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C", disabled: true },
];

describe("SegmentedControl", () => {
  it("renders a radiogroup container", () => {
    render(SegmentedControl, {
      props: { options, value: "a", onChange: () => {} },
    });
    const group = screen.getByRole("radiogroup");
    expect(group).toBeTruthy();
  });

  it("renders one radio per option", () => {
    render(SegmentedControl, {
      props: { options, value: "a", onChange: () => {} },
    });
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);
  });

  it("marks the selected option with aria-checked=true", () => {
    render(SegmentedControl, {
      props: { options, value: "b", onChange: () => {} },
    });
    const selected = screen.getByRole("radio", { name: "Option B" });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    const unselected = screen.getByRole("radio", { name: "Option A" });
    expect(unselected.getAttribute("aria-checked")).toBe("false");
  });

  it("renders all option labels", () => {
    render(SegmentedControl, {
      props: { options, value: "a", onChange: () => {} },
    });
    expect(screen.getByText("Option A")).toBeTruthy();
    expect(screen.getByText("Option B")).toBeTruthy();
    expect(screen.getByText("Option C")).toBeTruthy();
  });

  it("calls onChange when an option is clicked", async () => {
    const onChange = vi.fn();
    render(SegmentedControl, { props: { options, value: "a", onChange } });
    const optB = screen.getByRole("radio", { name: "Option B" });
    await fireEvent.click(optB);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("disabled options are not clickable", async () => {
    const onChange = vi.fn();
    render(SegmentedControl, { props: { options, value: "a", onChange } });
    const optC = screen.getByRole("radio", { name: "Option C" });
    expect(optC.hasAttribute("disabled")).toBe(true);
    await fireEvent.click(optC);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports ArrowRight to move selection forward", async () => {
    const onChange = vi.fn();
    render(SegmentedControl, { props: { options, value: "a", onChange } });
    const group = screen.getByRole("radiogroup");
    await fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("supports ArrowLeft to move selection backward", async () => {
    const onChange = vi.fn();
    render(SegmentedControl, { props: { options, value: "b", onChange } });
    const group = screen.getByRole("radiogroup");
    await fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("ArrowRight skips disabled options", async () => {
    const onChange = vi.fn();
    render(SegmentedControl, { props: { options, value: "b", onChange } });
    const group = screen.getByRole("radiogroup");
    // From b, next is c (disabled), should wrap to a
    await fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("merges custom class prop", () => {
    render(SegmentedControl, {
      props: { options, value: "a", onChange: () => {}, class: "custom-seg" },
    });
    const group = screen.getByRole("radiogroup");
    expect(group.className).toContain("custom-seg");
  });
});
