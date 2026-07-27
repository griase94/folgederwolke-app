/**
 * BeitragsverlaufList — per-year history; hero row + status-driven CTA.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import BeitragsverlaufList, {
  type BeitragsverlaufRow,
} from "./BeitragsverlaufList.svelte";

afterEach(() => cleanup());

function row(over: Partial<BeitragsverlaufRow> = {}): BeitragsverlaufRow {
  return {
    year: 2026,
    state: "overdue",
    isLocked: false,
    betragCents: 6969,
    paidCents: 0,
    gezahltAm: null,
    notes: null,
    exemptReason: null,
    daysOverdue: 91,
    ...over,
  };
}

describe("BeitragsverlaufList", () => {
  it("current year is the hero row with 'Zahlung erfassen' for overdue", () => {
    render(BeitragsverlaufList, {
      props: { rows: [row()], currentYear: 2026 },
    });
    const heroRow = screen.getByTestId("beitragsverlauf-row");
    expect(heroRow.getAttribute("data-hero")).toBe("true");
    expect(screen.getByTestId("beitragsverlauf-record").textContent).toMatch(
      /Zahlung erfassen/,
    );
  });

  it("partial hero shows 'Restbetrag erfassen' + rest amount", () => {
    render(BeitragsverlaufList, {
      props: {
        rows: [row({ state: "partial", paidCents: 3000, betragCents: 6969 })],
        currentYear: 2026,
      },
    });
    expect(screen.getByTestId("beitragsverlauf-record").textContent).toMatch(
      /Restbetrag erfassen/,
    );
  });

  it("paid row: no CTA", () => {
    render(BeitragsverlaufList, {
      props: {
        rows: [
          row({ state: "paid", paidCents: 6969, gezahltAm: "2026-02-10" }),
        ],
        currentYear: 2026,
      },
    });
    expect(screen.queryByTestId("beitragsverlauf-record")).toBeNull();
  });

  it("locked owing year: no CTA, shows 'festgeschrieben'", () => {
    render(BeitragsverlaufList, {
      props: {
        rows: [row({ year: 2024, state: "open", isLocked: true })],
        currentYear: 2026,
      },
    });
    expect(screen.queryByTestId("beitragsverlauf-record")).toBeNull();
    expect(screen.getByTestId("beitragsverlauf-locked").textContent).toMatch(
      /festgeschrieben/,
    );
  });

  it("renders a BeitragCell per row (data-state) and record delegates the year", async () => {
    const onRecordPayment = vi.fn();
    render(BeitragsverlaufList, {
      props: { rows: [row()], currentYear: 2026, onRecordPayment },
    });
    // BeitragCell pill inside the row carries the state
    expect(
      screen.getByTestId("beitrag-status-pill").getAttribute("data-state"),
    ).toBe("overdue");
    await fireEvent.click(screen.getByTestId("beitragsverlauf-record"));
    expect(onRecordPayment).toHaveBeenCalledWith(2026);
  });
});
