import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import Combobox from "./combobox.svelte";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

describe("ui/combobox", () => {
  it("filters by query and selects with keyboard (multiple)", async () => {
    const onValueChange = vi.fn();
    render(Combobox, {
      props: {
        options,
        value: [],
        multiple: true,
        onValueChange,
        placeholder: "Suchen…",
      },
    });

    await fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("combobox");
    await fireEvent.input(input, { target: { value: "be" } });

    // "Alpha" + "Gamma" filtered out, only "Beta" matches.
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Gamma")).toBeNull();
    expect(screen.getByText("Beta")).toBeTruthy();

    await fireEvent.keyDown(input, { key: "ArrowDown" });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith(["b"]);
  });

  it("toggles selections and keeps the popover open in multiple mode", async () => {
    const onValueChange = vi.fn();
    render(Combobox, {
      props: { options, value: ["a"], multiple: true, onValueChange },
    });

    await fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("combobox");

    // Selecting "Beta" adds it while keeping "a".
    await fireEvent.click(screen.getByRole("option", { name: /Beta/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "b"]);

    // Popover stays open: the listbox is still in the DOM.
    expect(screen.getByRole("listbox")).toBeTruthy();

    // Clicking an already-selected option toggles it off.
    await fireEvent.click(screen.getByRole("option", { name: /Alpha/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("single mode selects one value and closes the popover", async () => {
    const onValueChange = vi.fn();
    render(Combobox, {
      props: { options, value: [], onValueChange, ariaLabel: "Kategorie" },
    });

    await fireEvent.click(screen.getByRole("button"));
    await fireEvent.click(screen.getByRole("option", { name: /Gamma/ }));

    expect(onValueChange).toHaveBeenCalledWith(["c"]);
    // Single mode closes on select.
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("navigates with Home/End and selects with Enter", async () => {
    const onValueChange = vi.fn();
    render(Combobox, { props: { options, value: [], onValueChange } });

    await fireEvent.click(screen.getByRole("button"));
    const input = screen.getByRole("combobox");

    await fireEvent.keyDown(input, { key: "End" });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onValueChange).toHaveBeenLastCalledWith(["c"]);
  });

  it("closes on Escape", async () => {
    render(Combobox, { props: { options, value: [], onValueChange: vi.fn() } });

    await fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    await fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
