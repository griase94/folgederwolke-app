/**
 * Aurora — TransactionRow (master §2.4): single-link feed row, type chip
 * from --color-type-* tokens, signed amount in INK (never red on
 * individual rows — spec §2 amount color rule).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import TransactionRow from "./TransactionRow.svelte";

afterEach(() => cleanup());

const base = {
  type: "ausgabe" as const,
  title: "Bahnticket Workshop",
  metaLine: "12.05.2026 · Ideeller Bereich · Sommerfest",
  amountCents: -8450,
  signed: true as const,
  href: "/app/ausgaben/abc-1",
};

describe("TransactionRow", () => {
  it("is ONE link with title + signed amount in the accessible name", () => {
    const { container } = render(TransactionRow, { props: base });
    expect(container.querySelectorAll("a, button").length).toBe(1);
    const link = screen.getByTestId("txn-row");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/app/ausgaben/abc-1");
    expect(link.getAttribute("data-kind")).toBe("ausgabe");
    // formatMoney emits U+00A0 (NBSP) before € and may emit the U+2212 minus
    // (ICU) instead of ASCII '-'; match tolerantly. Expected: PASS.
    expect(link.getAttribute("aria-label")).toMatch(
      /^Bahnticket Workshop, [-−]84,50[\s ]€$/,
    );
  });

  it("renders the signed amount in ink with tabular numerals — never red", () => {
    render(TransactionRow, { props: base });
    const amount = screen.getByTestId("txn-row-amount");
    // Tolerate the ICU minus glyph (U+2212) as well as ASCII '-'.
    expect(amount.textContent).toMatch(/[-−]84,50/);
    expect(amount.className).toContain("tabular-nums");
    expect(amount.className).toContain("text-ink-900");
    expect(amount.className).not.toContain("severity-critical");
  });

  it("type chip carries the matching type tokens, row carries data-kind", () => {
    for (const [type, cls, glyph] of [
      ["ausgabe", "bg-type-ausgabe-tint", "↓"],
      ["einnahme", "bg-type-einnahme-tint", "↑"],
      ["spende", "bg-type-spende-tint", "♥"],
    ] as const) {
      const { unmount } = render(TransactionRow, { props: { ...base, type } });
      expect(screen.getByTestId("txn-row").getAttribute("data-kind")).toBe(
        type,
      );
      expect(screen.getByText(glyph).className).toContain(cls);
      unmount();
    }
  });

  it("renders the meta line and status chips with per-kind styling (row-chip testid)", () => {
    render(TransactionRow, {
      props: {
        ...base,
        statusChips: [
          { label: "Beleg fehlt", kind: "warn" },
          { label: "Geprüft", kind: "neutral" },
        ],
      },
    });
    expect(screen.getByText(/12\.05\.2026/)).toBeTruthy();
    const chips = screen.getAllByTestId("row-chip");
    // warn chip → amber severity tint; neutral chip → hairline-bordered ink-500.
    const warn = chips.find((c) => c.textContent?.includes("Beleg fehlt"))!;
    expect(warn.className).toContain("text-severity-warn-text");
    const neutral = chips.find((c) => c.textContent?.includes("Geprüft"))!;
    expect(neutral.className).toContain("text-ink-500");
  });
});
