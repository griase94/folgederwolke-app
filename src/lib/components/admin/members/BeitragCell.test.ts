/**
 * BeitragCell — consolidated Beitrags-Chipset (replaces BeitragsBadge +
 * BeitragStatusPill + MatrixCell).
 *
 * Asserts the AURORA amber-discipline tone contract (flow-mitglieder §2 AC3),
 * which corrects the pre-Aurora scheme: open/partial → --neutral-open (NEVER
 * amber), overdue → amber (severity-warn), paid → emerald only. Plus: labels,
 * partial fraction, the muted dash for not_applicable, both shells (pill +
 * interactive cell), testid + data-state continuity, and the lock decoration.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import BeitragCell from "./BeitragCell.svelte";

afterEach(() => cleanup());

describe("BeitragCell — tone contract (amber-discipline)", () => {
  it("paid: emerald + 'Bezahlt'", () => {
    const { container } = render(BeitragCell, {
      props: { state: "paid", paidCents: 6000, betragCents: 6000, year: 2025 },
    });
    const el = container.querySelector("[data-state='paid']")!;
    expect(el.className).toMatch(/emerald/);
    expect(el.textContent).toMatch(/Bezahlt/);
  });

  it("open: --neutral-open (NOT amber, NOT emerald), label 'Offen'", () => {
    const { container } = render(BeitragCell, {
      props: { state: "open", betragCents: 6000, year: 2025 },
    });
    const el = container.querySelector("[data-state='open']")!;
    expect(el.textContent).toMatch(/Offen/);
    expect(el.className).toMatch(/neutral-open/);
    expect(el.className).not.toMatch(/severity-warn|amber/);
    expect(el.className).not.toMatch(/emerald/);
  });

  it("overdue: amber (severity-warn), NOT neutral-open", () => {
    const { container } = render(BeitragCell, {
      props: {
        state: "overdue",
        betragCents: 6000,
        year: 2024,
        daysOverdue: 91,
      },
    });
    const el = container.querySelector("[data-state='overdue']")!;
    expect(el.className).toMatch(/severity-warn/);
    expect(el.className).not.toMatch(/emerald/);
  });

  it("partial: --neutral-open + fraction (NOT amber)", () => {
    const { container } = render(BeitragCell, {
      props: {
        state: "partial",
        paidCents: 3000,
        betragCents: 6000,
        year: 2025,
      },
    });
    const el = container.querySelector("[data-state='partial']")!;
    expect(el.textContent).toMatch(/30/);
    expect(el.textContent).toMatch(/60/);
    expect(el.className).toMatch(/neutral-open/);
    expect(el.className).not.toMatch(/severity-warn|amber/);
  });

  it("partial + compact (Matrix cell): only the paid amount is visible, the full fraction stays in the aria-label", () => {
    const { container } = render(BeitragCell, {
      props: {
        state: "partial",
        variant: "cell",
        compact: true,
        paidCents: 3000,
        betragCents: 6969,
        year: 2025,
        memberName: "Tim Schäfer",
      },
    });
    const el = container.querySelector("[data-state='partial']")!;
    // Visible in the dense 120px track: paid amount only — NOT the „/ 69,69".
    expect(el.textContent).toMatch(/30,00/);
    expect(el.textContent).not.toMatch(/69,69/);
    // Full „X von Y" truth is preserved for assistive tech.
    expect(el.getAttribute("aria-label")).toMatch(/30,00.*von.*69,69/);
  });

  it("partial + compact PILL (list/card): keeps the full fraction — compact must NOT strip it outside the Matrix cell", () => {
    // Regression guard (mitglieder.spec @phase-member-zahlung): the list row pill
    // is compact too, but has room — the visible fraction is Judge-pinned. Only
    // variant='cell' (the 120px Matrix track) collapses to the paid amount.
    const { container } = render(BeitragCell, {
      props: {
        state: "partial",
        variant: "pill",
        compact: true,
        paidCents: 3000,
        betragCents: 6000,
        year: 2025,
      },
    });
    const el = container.querySelector("[data-state='partial']")!;
    expect(el.textContent).toMatch(/30,00/);
    expect(el.textContent).toMatch(/60,00/);
  });

  it("exempt / permanently_exempt: slate/ink, 'Befreit', no emerald", () => {
    for (const state of ["exempt", "permanently_exempt"] as const) {
      const { container } = render(BeitragCell, {
        props: { state, year: 2025, exemptReason: "Ehrenmitglied" },
      });
      const el = container.querySelector(`[data-state='${state}']`)!;
      expect(el.textContent).toMatch(/Befreit/);
      expect(el.className).not.toMatch(/emerald/);
      cleanup();
    }
  });

  it("not_applicable_*: muted dash, no chrome", () => {
    for (const state of [
      "not_applicable_pre_join",
      "not_applicable_post_austritt",
    ] as const) {
      const { container } = render(BeitragCell, {
        props: { state, year: 2025 },
      });
      const el = container.querySelector(`[data-state='${state}']`)!;
      expect(el.textContent).toMatch(/—/);
      expect(el.className).not.toMatch(/emerald/);
      cleanup();
    }
  });
});

describe("BeitragCell — shells + a11y + interaction", () => {
  it("pill variant (default): span with data-testid='beitrag-status-pill' + min-h-11", () => {
    render(BeitragCell, {
      props: { state: "paid", paidCents: 6000, betragCents: 6000, year: 2025 },
    });
    const el = screen.getByTestId("beitrag-status-pill");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toMatch(/min-h-11/);
  });

  it("cell variant: interactive gridcell button; click dispatches onOpenPopover with kind", async () => {
    const onOpenPopover = vi.fn();
    render(BeitragCell, {
      props: {
        state: "open",
        variant: "cell",
        memberId: "m1",
        year: 2026,
        betragCents: 6969,
        onOpenPopover,
      },
    });
    const btn = screen.getByRole("gridcell");
    expect(btn.tagName).toBe("BUTTON");
    await fireEvent.click(btn);
    expect(onOpenPopover).toHaveBeenCalledTimes(1);
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mark-paid",
        memberId: "m1",
        year: 2026,
      }),
    );
  });

  it("cell variant: locked open cell fires onLocked (read-only), not onOpenPopover", async () => {
    const onOpenPopover = vi.fn();
    const onLocked = vi.fn();
    render(BeitragCell, {
      props: {
        state: "open",
        variant: "cell",
        isLocked: true,
        memberId: "m1",
        year: 2024,
        betragCents: 6969,
        onOpenPopover,
        onLocked,
      },
    });
    await fireEvent.click(screen.getByRole("gridcell"));
    expect(onLocked).toHaveBeenCalledWith({ year: 2024 });
    expect(onOpenPopover).not.toHaveBeenCalled();
  });

  it("cell variant: not_applicable ('—') is interactive and opens the mini (no dead-end)", async () => {
    const onOpenPopover = vi.fn();
    render(BeitragCell, {
      props: {
        state: "not_applicable_pre_join",
        variant: "cell",
        memberId: "m1",
        year: 2023,
        onOpenPopover,
      },
    });
    const btn = screen.getByRole("gridcell");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(btn.getAttribute("tabindex")).toBe("0");
    await fireEvent.click(btn);
    expect(onOpenPopover).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "mini", memberId: "m1", year: 2023 }),
    );
  });

  it("cell variant: locked_year stays non-interactive (lock uses the onLocked path)", () => {
    render(BeitragCell, {
      props: {
        state: "locked_year",
        variant: "cell",
        memberId: "m1",
        year: 2023,
      },
    });
    const btn = screen.getByRole("gridcell", { hidden: true });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("tabindex")).toBe("-1");
  });

  it("isLocked pill carries data-locked + an aria-label 'festgeschrieben' note", () => {
    const { container } = render(BeitragCell, {
      props: {
        state: "paid",
        isLocked: true,
        paidCents: 6000,
        betragCents: 6000,
        year: 2024,
      },
    });
    const el = container.querySelector("[data-state='paid']")!;
    expect(el.getAttribute("data-locked")).toBe("true");
    expect(el.getAttribute("aria-label")).toMatch(/festgeschrieben/);
  });
});
