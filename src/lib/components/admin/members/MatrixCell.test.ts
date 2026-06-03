/**
 * @phase-2 Task 2.2 — MatrixCell click-dispatch + ARIA contract.
 *
 * The cell dispatches the correct popover kind per state, fires `onLocked`
 * for locked years, and stays inert for not-applicable cells. role="gridcell"
 * + per-state aria-label + data-state attribute are part of the contract the
 * auto-focus chain (Task 2.7) depends on.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import MatrixCell from "./MatrixCell.svelte";
import type { CellState } from "$lib/domain/beitrag-cell.js";

afterEach(() => cleanup());

function renderCell(
  state: CellState,
  cbs: {
    onOpenPopover?: (detail: {
      kind: string;
      memberId: string;
      year: number;
      triggerEl: HTMLElement;
    }) => void;
    onLocked?: (detail: { year: number }) => void;
  } = {},
  extra: Record<string, unknown> = {},
) {
  return render(MatrixCell, {
    props: {
      state,
      memberId: "m1",
      year: 2026,
      memberName: "Erika Mustermann",
      betragCents: 6969,
      ...cbs,
      ...extra,
    },
  });
}

describe("MatrixCell — click dispatch", () => {
  it("dispatches kind=mark-paid for an open cell", async () => {
    const onOpenPopover = vi.fn();
    renderCell("open", { onOpenPopover });
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mark-paid",
        memberId: "m1",
        year: 2026,
      }),
    );
  });

  it("dispatches kind=mark-paid for an overdue cell", async () => {
    const onOpenPopover = vi.fn();
    renderCell("overdue", { onOpenPopover }, { daysOverdue: 90 });
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mark-paid" }),
    );
  });

  it("dispatches kind=paid for a paid cell", async () => {
    const onOpenPopover = vi.fn();
    renderCell(
      "paid",
      { onOpenPopover },
      { paidCents: 6969, gezahltAm: "2026-05-15" },
    );
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "paid" }),
    );
  });

  it("dispatches kind=exempt for a per-year exempt cell", async () => {
    const onOpenPopover = vi.fn();
    renderCell("exempt", { onOpenPopover }, { exemptReason: "Härtefall" });
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "exempt" }),
    );
  });

  it("dispatches kind=permanently_exempt for an Ehrenmitglied cell", async () => {
    const onOpenPopover = vi.fn();
    renderCell(
      "permanently_exempt",
      { onOpenPopover },
      {
        exemptReason: "Ehrenmitglied",
      },
    );
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "permanently_exempt" }),
    );
  });

  it("does NOT dispatch for not_applicable_pre_join (inert)", async () => {
    const onOpenPopover = vi.fn();
    renderCell("not_applicable_pre_join", { onOpenPopover });
    const cell = screen.getByRole("gridcell") as HTMLButtonElement;
    expect(cell.disabled).toBe(true);
    await fireEvent.click(cell);
    expect(onOpenPopover).not.toHaveBeenCalled();
  });

  it("does NOT dispatch for not_applicable_post_austritt (inert)", async () => {
    const onOpenPopover = vi.fn();
    renderCell("not_applicable_post_austritt", { onOpenPopover });
    const cell = screen.getByRole("gridcell") as HTMLButtonElement;
    expect(cell.disabled).toBe(true);
    await fireEvent.click(cell);
    expect(onOpenPopover).not.toHaveBeenCalled();
  });

  it("fires onLocked (not open-popover) for a locked-year cell", async () => {
    const onOpenPopover = vi.fn();
    const onLocked = vi.fn();
    renderCell("locked_year", { onOpenPopover, onLocked });
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onOpenPopover).not.toHaveBeenCalled();
    expect(onLocked).toHaveBeenCalledWith({ year: 2026 });
  });
});

describe("MatrixCell — ARIA + data-state", () => {
  it("sets role=gridcell and a state-specific aria-label", () => {
    renderCell("open");
    const cell = screen.getByRole("gridcell");
    expect(cell.getAttribute("aria-label")).toMatch(/Offen/);
  });

  it("exposes data-state for the auto-focus chain", () => {
    const { container } = renderCell("overdue", {}, { daysOverdue: 5 });
    const cell = container.querySelector('[role="gridcell"]');
    expect(cell?.getAttribute("data-state")).toBe("overdue");
  });

  it("interactive cells are keyboard-focusable (tabindex 0)", () => {
    renderCell("open");
    expect(screen.getByRole("gridcell").getAttribute("tabindex")).toBe("0");
  });

  it("inert cells are removed from tab order (tabindex -1)", () => {
    renderCell("not_applicable_pre_join");
    expect(screen.getByRole("gridcell").getAttribute("tabindex")).toBe("-1");
  });

  it("Enter key triggers the popover dispatch", async () => {
    const onOpenPopover = vi.fn();
    renderCell("open", { onOpenPopover });
    await fireEvent.keyDown(screen.getByRole("gridcell"), { key: "Enter" });
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mark-paid" }),
    );
  });
});
