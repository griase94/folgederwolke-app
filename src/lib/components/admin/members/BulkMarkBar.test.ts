/**
 * BulkMarkBar — docked bulk "als bezahlt markieren" bar.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import BulkMarkBar from "./BulkMarkBar.svelte";

afterEach(() => cleanup());

describe("BulkMarkBar", () => {
  it("shows the selection count and an enabled commit when count > 0", () => {
    render(BulkMarkBar, {
      props: { count: 2, onCommit: () => {}, onCancel: () => {} },
    });
    expect(screen.getByTestId("bulk-mark-bar-count").textContent).toMatch(
      /2 ausgewählt/,
    );
    const commit = screen.getByTestId(
      "bulk-mark-bar-commit",
    ) as HTMLButtonElement;
    expect(commit.disabled).toBe(false);
    expect(commit.textContent).toMatch(/2 als bezahlt markieren/);
  });

  it("commit calls onCommit with the payment date", async () => {
    const onCommit = vi.fn();
    render(BulkMarkBar, {
      props: {
        count: 2,
        gezahltAm: "2026-06-30",
        onCommit,
        onCancel: () => {},
      },
    });
    await fireEvent.click(screen.getByTestId("bulk-mark-bar-commit"));
    expect(onCommit).toHaveBeenCalledWith("2026-06-30");
  });

  it("count 0: commit disabled + honest gate-line, no dead button", () => {
    render(BulkMarkBar, {
      props: { count: 0, onCommit: () => {}, onCancel: () => {} },
    });
    expect(
      (screen.getByTestId("bulk-mark-bar-commit") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByTestId("bulk-mark-bar-gate").textContent).toMatch(
      /Fehlt noch/,
    );
  });

  it("submitting: commit disabled", () => {
    render(BulkMarkBar, {
      props: {
        count: 3,
        submitting: true,
        onCommit: () => {},
        onCancel: () => {},
      },
    });
    expect(
      (screen.getByTestId("bulk-mark-bar-commit") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    render(BulkMarkBar, {
      props: { count: 2, onCommit: () => {}, onCancel },
    });
    await fireEvent.click(screen.getByTestId("bulk-mark-bar-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
