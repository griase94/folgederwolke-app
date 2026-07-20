/**
 * Aurora — TransactionRow (master §2.4): single-link feed row, type chip
 * from --color-type-* tokens, signed amount in the AA-safe TYPE hue (plate
 * transaktionen-v4 .amt-*, brief §5) — never the critical red on a row.
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

  it("renders the signed amount in the type hue with tabular numerals — never the critical red", () => {
    render(TransactionRow, { props: base });
    const amount = screen.getByTestId("txn-row-amount");
    // Tolerate the ICU minus glyph (U+2212) as well as ASCII '-'.
    expect(amount.textContent).toMatch(/[-−]84,50/);
    expect(amount.className).toContain("tabular-nums");
    // Ausgabe row → AA-safe plum text token (plate `.amt-aus`), not the
    // critical red reserved for negative aggregates.
    expect(amount.className).toContain("text-(--ausgabe-text)");
    expect(amount.className).not.toContain("severity-critical");
  });

  it("type glyph tile carries the matching type tokens, row carries data-kind", () => {
    for (const [type, cls] of [
      ["ausgabe", "bg-type-ausgabe-tint"],
      ["einnahme", "bg-type-einnahme-tint"],
      ["spende", "bg-type-spende-tint"],
    ] as const) {
      const { container, unmount } = render(TransactionRow, {
        props: { ...base, type },
      });
      expect(screen.getByTestId("txn-row").getAttribute("data-kind")).toBe(
        type,
      );
      // The 34px glyph squircle (Lucide icon inside) carries the type tint token.
      const glyph = container.querySelector('[data-slot="row-glyph"]');
      expect(glyph?.className).toContain(cls);
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
