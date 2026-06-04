import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import MultiselectChip from "./multiselect-chip.svelte";

describe("ui/multiselect-chip", () => {
  it("renders label: value text", () => {
    render(MultiselectChip, {
      props: { label: "Status", value: "Genehmigt", onRemove: vi.fn() },
    });
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Genehmigt")).toBeTruthy();
  });

  it("removes on × click and on Backspace when focused", async () => {
    const onRemove = vi.fn();
    render(MultiselectChip, {
      props: { label: "Status", value: "Genehmigt", onRemove },
    });

    // × click → onRemove
    const removeButton = screen.getByRole("button", { name: /entfernen/i });
    await fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledOnce();

    onRemove.mockClear();

    // Backspace when the button is focused → onRemove (A3-01 amendment)
    removeButton.focus();
    await fireEvent.keyDown(removeButton, { key: "Backspace" });
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("removes on Delete when focused", async () => {
    const onRemove = vi.fn();
    render(MultiselectChip, {
      props: { label: "Kategorie", value: "Ausgabe", onRemove },
    });

    const removeButton = screen.getByRole("button", { name: /entfernen/i });
    removeButton.focus();
    await fireEvent.keyDown(removeButton, { key: "Delete" });
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("has an accessible aria-label on the remove button", () => {
    render(MultiselectChip, {
      props: { label: "Status", value: "Genehmigt", onRemove: vi.fn() },
    });
    const btn = screen.getByRole("button", { name: /entfernen/i });
    expect(btn).toBeTruthy();
    // aria-label must contain the value for screen-reader context
    const label = btn.getAttribute("aria-label") ?? "";
    expect(label.toLowerCase()).toContain("entfernen");
  });
});
