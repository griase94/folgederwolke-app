/**
 * InlineConfirm — two-step armed destructive control.
 * Arms on first click, confirms on second, disarms on Esc/blur; never
 * auto-confirms.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import InlineConfirm from "./InlineConfirm.svelte";

afterEach(() => cleanup());

describe("InlineConfirm", () => {
  it("shows the resting label and is not armed initially", () => {
    render(InlineConfirm, {
      props: { label: "Stornieren", onConfirm: () => {} },
    });
    const btn = screen.getByTestId("inline-confirm");
    expect(btn.textContent).toMatch(/Stornieren/);
    expect(btn.getAttribute("data-armed")).toBeNull();
  });

  it("first click arms (label swap, data-armed) without confirming", async () => {
    const onConfirm = vi.fn();
    render(InlineConfirm, { props: { label: "Stornieren", onConfirm } });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    expect(btn.getAttribute("data-armed")).toBe("true");
    expect(btn.textContent).toMatch(/Wirklich stornieren\?/);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("second click confirms exactly once and disarms", async () => {
    const onConfirm = vi.fn();
    render(InlineConfirm, { props: { label: "Stornieren", onConfirm } });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    await fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute("data-armed")).toBeNull();
  });

  it("Esc disarms without confirming", async () => {
    const onConfirm = vi.fn();
    render(InlineConfirm, { props: { label: "Aufheben", onConfirm } });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    expect(btn.getAttribute("data-armed")).toBe("true");
    await fireEvent.keyDown(btn, { key: "Escape" });
    expect(btn.getAttribute("data-armed")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blur disarms", async () => {
    render(InlineConfirm, {
      props: { label: "Stornieren", onConfirm: () => {} },
    });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    expect(btn.getAttribute("data-armed")).toBe("true");
    await fireEvent.blur(btn);
    expect(btn.getAttribute("data-armed")).toBeNull();
  });

  it("custom confirmLabel overrides the default", async () => {
    render(InlineConfirm, {
      props: {
        label: "Aufheben",
        confirmLabel: "Befreiung wirklich aufheben?",
        onConfirm: () => {},
      },
    });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    expect(btn.textContent).toMatch(/Befreiung wirklich aufheben\?/);
  });

  it("disabled: click does nothing", async () => {
    const onConfirm = vi.fn();
    render(InlineConfirm, {
      props: { label: "Stornieren", disabled: true, onConfirm },
    });
    const btn = screen.getByTestId("inline-confirm");
    await fireEvent.click(btn);
    expect(btn.getAttribute("data-armed")).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
