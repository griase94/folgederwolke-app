/**
 * White-label Phase 1 — composeBezahltVonDisplay (ADR-0007) write-time snapshot
 * for the `verein` payer variant. The runtime Verein name is persisted when
 * supplied; otherwise it falls back to the neutral "Verein" token (never a
 * hardcoded "Folge der Wolke" literal).
 */
import { describe, it, expect } from "vitest";
import {
  composeBezahltVonDisplay,
  type BezahltVon,
} from "$lib/server/domain/auslagen.js";

describe("composeBezahltVonDisplay — verein variant (white-label)", () => {
  it("persists the supplied runtime Verein name", () => {
    const bv: BezahltVon = { kind: "verein", display_name: "Verein X e.V." };
    expect(composeBezahltVonDisplay(bv)).toBe("Verein X e.V.");
    expect(composeBezahltVonDisplay(bv)).not.toContain("Folge der Wolke");
  });

  it("falls back to the neutral 'Verein' token when no name supplied", () => {
    const bv: BezahltVon = { kind: "verein" };
    expect(composeBezahltVonDisplay(bv)).toBe("Verein");
  });

  it("treats a whitespace-only display_name as the fallback", () => {
    const bv: BezahltVon = { kind: "verein", display_name: "   " };
    expect(composeBezahltVonDisplay(bv)).toBe("Verein");
  });
});
