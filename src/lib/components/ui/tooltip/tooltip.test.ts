import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import TooltipHarness from "./tooltip.test.svelte";

describe("ui/tooltip", () => {
  it("shows tooltip on hover and hides on pointer-leave", async () => {
    render(TooltipHarness);
    const trigger = screen.getByRole("button", { name: /hover me/i });

    // pointerenter → tooltip should appear (delayDuration=0 on the harness)
    await fireEvent.pointerEnter(trigger);
    expect(await screen.findByRole("tooltip")).toBeTruthy();

    // pointerleave → tooltip should disappear
    await fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows tooltip on keyboard focus and hides on blur", async () => {
    render(TooltipHarness);
    const trigger = screen.getByRole("button", { name: /hover me/i });

    // focus the trigger → tooltip should appear
    await fireEvent.focus(trigger);
    expect(await screen.findByRole("tooltip")).toBeTruthy();

    // blur → tooltip should disappear
    await fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
