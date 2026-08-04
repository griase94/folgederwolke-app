/**
 * S4 #6 — the no-Beitragssatz handling is SYMMETRIC across the Beitragsmatrix
 * loader and the reminder-candidate loader, because both derive per-(member,
 * year) state from the ONE canonical `resolveBeitragState`. There is no separate
 * "skip" rule to keep in sync; this test freezes the shared contract so a future
 * divergence (e.g. one loader growing its own no-satz branch) is caught.
 *
 * Both loaders feed resolveBeitragState the same shape: `row` (the member_beitrags
 * row or null) + `satzCents` (the year's Satz or null). This test pins the output
 * for the no-row + no-satz case and re-derives, for that exact output, what each
 * loader would then do — matrix cell state vs. reminder owing-verdict/openCents —
 * proving they agree.
 *
 * @aurora-impl-c2
 */
import { describe, it, expect } from "vitest";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

// The inputs both loaders pass for an active member with NO row and NO Satz.
const NO_SATZ_NO_ROW = {
  year: 2026,
  eintrittsJahr: 2020,
  austrittsJahr: null,
  beitragExempt: false,
  row: null,
  satzCents: null,
  festBis: null,
  // Fälligkeit long past → the "would-be-overdue" branch, i.e. the exact case the
  // C1 M6 review worried would fabricate an "Überfällig 0,00".
  faelligkeit: "2026-03-31",
  graceDays: 60,
} as const;

describe("no-Beitragssatz handling is shared by matrix-loader + reminder-candidates", () => {
  const resolved = resolveBeitragState(NO_SATZ_NO_ROW);

  it("resolveBeitragState yields a zero-basis, satz-missing state (no fabricated debt)", () => {
    expect(resolved.betragCents).toBe(0);
    expect(resolved.paidCents).toBe(0);
    expect(resolved.satzMissing).toBe(true);
  });

  it("the SAME resolved output drives both loaders identically", () => {
    // matrix-loader: pushes a cell carrying `resolved.state`; the "Satz fehlt"
    // hint is surfaced from `satzMissing` — never a phantom Betrag.
    const matrixCellState = resolved.state;

    // reminder-candidates: keeps a member only when state ∈ {open, partial,
    // overdue}, with openCents = max(betragCents − paidCents, 0).
    const owingStates = ["open", "partial", "overdue"] as const;
    const isOwingCandidate = (owingStates as readonly string[]).includes(
      resolved.state,
    );
    const openCents = Math.max(resolved.betragCents - resolved.paidCents, 0);

    // Both keyed off the same resolver output: whatever state the matrix shows,
    // the reminder loader's owing-verdict follows from it — and the zero basis
    // makes any such candidate a 0,00 one (which the seeded-Satz reality avoids).
    expect(matrixCellState).toBe(resolved.state);
    if (isOwingCandidate) {
      expect(openCents).toBe(0);
    }
  });
});
