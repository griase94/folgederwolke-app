/**
 * @phase-2 Task 2.1 — BeitragsBadge state rendering.
 *
 * Verifies each of the 8 CellStates renders the correct lucide glyph, the
 * data-state attribute, and (for overdue) the +Xd suffix. WCAG 1.4.1: the
 * glyph is the primary signal — these tests lock the glyph-per-state contract.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BeitragsBadge from "./BeitragsBadge.svelte";
import type { CellState } from "$lib/server/domain/matrix-loader.js";

afterEach(() => cleanup());

function renderState(state: CellState, extra: Record<string, unknown> = {}) {
  return render(BeitragsBadge, {
    props: { state, year: 2026, ...extra },
  });
}

describe("BeitragsBadge — state rendering", () => {
  it("renders data-state=paid with a Check glyph", () => {
    const { container } = renderState("paid", {
      paidCents: 6969,
      gezahltAm: "2026-05-15",
    });
    const el = container.querySelector('[data-state="paid"]');
    expect(el).toBeTruthy();
    // lucide-svelte renders an inline <svg> with a lucide class
    expect(container.querySelector("svg.lucide-check")).toBeTruthy();
  });

  it("renders data-state=open with a Circle glyph", () => {
    const { container } = renderState("open", { betragCents: 6969 });
    expect(container.querySelector('[data-state="open"]')).toBeTruthy();
    expect(container.querySelector("svg.lucide-circle")).toBeTruthy();
  });

  it("renders data-state=overdue with TriangleAlert + +Xd suffix + left-border", () => {
    const { container } = renderState("overdue", {
      betragCents: 6969,
      daysOverdue: 87,
    });
    const el = container.querySelector('[data-state="overdue"]');
    expect(el).toBeTruthy();
    expect(container.querySelector("svg.lucide-triangle-alert")).toBeTruthy();
    expect(screen.getByText("+87d")).toBeTruthy();
    // left-bar is the distinctive non-color signal
    expect(el!.className).toMatch(/border-l-amber-600/);
  });

  it("renders data-state=exempt with a Ban glyph and slate bg", () => {
    const { container } = renderState("exempt", { exemptReason: "Härtefall" });
    const el = container.querySelector('[data-state="exempt"]');
    expect(el).toBeTruthy();
    expect(container.querySelector("svg.lucide-ban")).toBeTruthy();
    expect(el!.className).toMatch(/bg-slate-50/);
  });

  it("renders data-state=permanently_exempt with Ban + Lock glyphs", () => {
    const { container } = renderState("permanently_exempt", {
      exemptReason: "Ehrenmitglied",
    });
    expect(
      container.querySelector('[data-state="permanently_exempt"]'),
    ).toBeTruthy();
    expect(container.querySelector("svg.lucide-ban")).toBeTruthy();
    expect(container.querySelector("svg.lucide-lock")).toBeTruthy();
  });

  it("renders not_applicable_pre_join with a Minus glyph", () => {
    const { container } = renderState("not_applicable_pre_join");
    expect(
      container.querySelector('[data-state="not_applicable_pre_join"]'),
    ).toBeTruthy();
    expect(container.querySelector("svg.lucide-minus")).toBeTruthy();
  });

  it("renders not_applicable_post_austritt with a Minus glyph", () => {
    const { container } = renderState("not_applicable_post_austritt");
    expect(
      container.querySelector('[data-state="not_applicable_post_austritt"]'),
    ).toBeTruthy();
    expect(container.querySelector("svg.lucide-minus")).toBeTruthy();
  });

  it("renders locked_year with a Lock glyph and reduced opacity", () => {
    const { container } = renderState("locked_year");
    const el = container.querySelector('[data-state="locked_year"]');
    expect(el).toBeTruthy();
    expect(container.querySelector("svg.lucide-lock")).toBeTruthy();
    expect(el!.className).toMatch(/opacity-60/);
  });

  it("uses NO emoji — every glyph is an svg", () => {
    const states: CellState[] = [
      "paid",
      "open",
      "overdue",
      "exempt",
      "permanently_exempt",
      "not_applicable_pre_join",
      "not_applicable_post_austritt",
      "locked_year",
    ];
    for (const s of states) {
      const { container } = renderState(s, { daysOverdue: 5 });
      const text = container.textContent ?? "";
      // No emoji codepoints (rough range check for pictographs)
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).toBe(false);
      cleanup();
    }
  });
});
