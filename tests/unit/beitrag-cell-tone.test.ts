import { describe, it, expect } from "vitest";
import {
  beitragCellTone,
  beitragCellLabel,
  type CellState,
} from "../../src/lib/domain/beitrag-cell.js";

/**
 * S15 (DESIGN-DEBT-REGISTER): the Beitrags-Chip state→tone mapping must live in
 * exactly ONE place (`domain/beitrag-cell`) so the Matrix cell and the
 * Liste/Detail/Karten pill can never drift into two colour systems again —
 * "überfällig" used to be amber in the Matrix but rosa in the Liste.
 *
 * These pins lock the amber-discipline invariant (flow-mitglieder red thread):
 * amber (severity-warn) is reserved for `overdue`; a merely-open Beitrag stays
 * calm (--neutral-open) and never reads as a warning.
 */
describe("beitragCellTone (S15 single source of truth)", () => {
  it("overdue is the ONLY amber (severity-warn) state — never rosa/pink", () => {
    const tone = beitragCellTone("overdue");
    expect(tone).toContain("severity-warn");
    // The pre-consolidation Liste rosa/pink must never resurface here.
    expect(tone).not.toMatch(/rose|pink|rosa/);
  });

  it("open + partial carry the calm neutral-open family — never a warning", () => {
    for (const state of ["open", "partial"] as CellState[]) {
      const tone = beitragCellTone(state);
      expect(tone).toContain("neutral-open");
      expect(tone).not.toContain("severity-warn");
    }
  });

  it("open and partial share the identical tone (one calm family)", () => {
    expect(beitragCellTone("open")).toBe(beitragCellTone("partial"));
  });

  it("paid is emerald WITH a dark path (not stranded light-green on dark)", () => {
    const tone = beitragCellTone("paid");
    expect(tone).toContain("emerald");
    expect(tone).toContain("dark:");
  });

  it("exempt / permanently_exempt / locked_year are neutral ink (not amber)", () => {
    for (const state of [
      "exempt",
      "permanently_exempt",
      "locked_year",
    ] as CellState[]) {
      const tone = beitragCellTone(state);
      expect(tone).toContain("ink-500");
      expect(tone).not.toContain("severity-warn");
    }
  });

  it("not_applicable states are a bare muted dash (no chrome)", () => {
    for (const state of [
      "not_applicable_pre_join",
      "not_applicable_post_austritt",
    ] as CellState[]) {
      expect(beitragCellTone(state)).toBe("text-ink-300");
    }
  });
});

describe("beitragCellLabel", () => {
  it("maps each state to its short one-word signal", () => {
    expect(beitragCellLabel("paid")).toBe("Bezahlt");
    expect(beitragCellLabel("partial")).toBe("Teilzahlung");
    expect(beitragCellLabel("open")).toBe("Offen");
    expect(beitragCellLabel("overdue")).toBe("Offen");
    expect(beitragCellLabel("exempt")).toBe("Befreit");
    expect(beitragCellLabel("permanently_exempt")).toBe("Befreit");
    expect(beitragCellLabel("not_applicable_pre_join")).toBe("—");
    expect(beitragCellLabel("not_applicable_post_austritt")).toBe("—");
  });
});
