import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import PopoverHarness from "./popover.test.svelte"; // mounts Root+Trigger+Content with a "hello" body
describe("ui/popover", () => {
  it("opens on trigger click and closes on Escape", async () => {
    render(PopoverHarness);
    const trigger = screen.getByRole("button", { name: /open/i });
    await fireEvent.click(trigger);
    expect(await screen.findByText("hello")).toBeTruthy();
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText("hello")).toBeNull();
  });
});
