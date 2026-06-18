/**
 * @vitest-environment node
 *
 * Table-driven tests for resolveBeitragState — the canonical per-member-per-year
 * status resolver (Package A, member-zahlung redesign plan).
 *
 * Covers:
 *   - partial (30/60 €): row with 0 < paidCents < betragCents
 *   - ausgetreten year > austritt (muted) vs. year <= austritt (still applies)
 *   - pre_eintritt: year < eintrittsJahr
 *   - exempt precedence: permanently_exempt beats per-year exempt beats paid
 *   - no-row + no-satz: open with no betrag hint
 *   - locked-but-paid → paid (not dead minus): locked year reads underlying paid
 */

import { describe, it, expect } from "vitest";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

// Minimal row shape used by resolveBeitragState
function row(opts: {
  betragCents: number;
  paidCents: number;
  isExempt?: boolean;
  gezahltAm?: string | null;
}): Parameters<typeof resolveBeitragState>[0]["row"] {
  return {
    betragCents: opts.betragCents,
    paidCents: opts.paidCents,
    isExempt: opts.isExempt ?? false,
    gezahltAm: opts.gezahltAm ?? null,
  };
}

describe("resolveBeitragState", () => {
  // ── partial (key new state) ────────────────────────────────────────────────

  it("partial: 30/60 — 0 < paidCents < betragCents", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 3000 }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("partial");
    expect(result.betragCents).toBe(6000);
    expect(result.paidCents).toBe(3000);
  });

  it("partial: 1 cent paid of 6969 — still partial", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6969, paidCents: 1 }),
      satzCents: 6969,
      festBis: null,
    });
    expect(result.state).toBe("partial");
  });

  // ── paid ───────────────────────────────────────────────────────────────────

  it("paid: paidCents >= betragCents > 0", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 6000 }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("paid");
  });

  it("paid: overpayment (paidCents > betragCents)", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 7000 }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("paid");
  });

  // ── open ───────────────────────────────────────────────────────────────────

  it("open: no row, satz present", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
      faelligkeit: "2099-03-31", // far future — deterministic open result
    });
    expect(result.state).toBe("open");
    expect(result.betragCents).toBe(6000);
    expect(result.paidCents).toBe(0);
  });

  it("open: row present, paidCents = 0", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 0 }),
      satzCents: 6000,
      festBis: null,
      faelligkeit: "2099-03-31", // far future — deterministic open result
    });
    expect(result.state).toBe("open");
  });

  // ── no-row + no-satz ───────────────────────────────────────────────────────

  it("no-row + no-satz: open with betragCents=0 (hint: Beitragssatz fehlt)", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: null,
      festBis: null,
      faelligkeit: "2099-03-31", // far future — deterministic open result
    });
    expect(result.state).toBe("open");
    expect(result.betragCents).toBe(0);
    expect(result.satzMissing).toBe(true);
  });

  // ── pre_eintritt ───────────────────────────────────────────────────────────

  it("pre_eintritt: year < eintrittsJahr", () => {
    const result = resolveBeitragState({
      year: 2019,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("not_applicable_pre_join");
  });

  it("pre_eintritt: year === eintrittsJahr is NOT pre_eintritt", () => {
    const result = resolveBeitragState({
      year: 2020,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).not.toBe("not_applicable_pre_join");
  });

  // ── ausgetreten ────────────────────────────────────────────────────────────

  it("ausgetreten: year > austrittsJahr → not_applicable_post_austritt", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2018,
      austrittsJahr: 2023,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("not_applicable_post_austritt");
  });

  it("ausgetreten: year === austrittsJahr is NOT ausgetreten (exit year still applies)", () => {
    const result = resolveBeitragState({
      year: 2023,
      eintrittsJahr: 2018,
      austrittsJahr: 2023,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).not.toBe("not_applicable_post_austritt");
  });

  it("ausgetreten: year < austrittsJahr is NOT ausgetreten", () => {
    const result = resolveBeitragState({
      year: 2022,
      eintrittsJahr: 2018,
      austrittsJahr: 2023,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 6000 }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("paid");
  });

  // ── exempt precedence ──────────────────────────────────────────────────────

  it("permanently_exempt: beitragExempt=true beats paid row", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: true,
      row: row({ betragCents: 6000, paidCents: 6000 }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("permanently_exempt");
  });

  it("permanently_exempt: beitragExempt=true beats per-year exempt", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: true,
      row: row({ betragCents: 6000, paidCents: 0, isExempt: true }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("permanently_exempt");
  });

  it("per-year exempt: row.isExempt=true (beitragExempt=false)", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 0, isExempt: true }),
      satzCents: 6000,
      festBis: null,
    });
    expect(result.state).toBe("exempt");
  });

  // ── locked-but-paid → paid (NOT dead minus) ────────────────────────────────

  it("locked year with paid underlying → state=paid, isLocked=true", () => {
    const result = resolveBeitragState({
      year: 2024,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 6000 }),
      satzCents: 6000,
      festBis: 2024,
    });
    expect(result.state).toBe("paid");
    expect(result.isLocked).toBe(true);
  });

  it("locked year with partial underlying → state=partial, isLocked=true", () => {
    const result = resolveBeitragState({
      year: 2024,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 3000 }),
      satzCents: 6000,
      festBis: 2024,
    });
    expect(result.state).toBe("partial");
    expect(result.isLocked).toBe(true);
  });

  it("locked year with open underlying → state=open, isLocked=true", () => {
    const result = resolveBeitragState({
      year: 2024,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: 2024,
      faelligkeit: "2099-03-31", // far future — deterministic open result
    });
    expect(result.state).toBe("open");
    expect(result.isLocked).toBe(true);
  });

  it("locked year with exempt underlying → state=exempt, isLocked=true", () => {
    const result = resolveBeitragState({
      year: 2024,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: row({ betragCents: 6000, paidCents: 0, isExempt: true }),
      satzCents: 6000,
      festBis: 2024,
    });
    expect(result.state).toBe("exempt");
    expect(result.isLocked).toBe(true);
  });

  it("year > festBis is NOT locked", () => {
    const result = resolveBeitragState({
      year: 2025,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: 2024,
    });
    expect(result.isLocked).toBe(false);
  });

  // ── overdue (faelligkeit + graceDays) ─────────────────────────────────────

  it("overdue: past faelligkeit + graceDays", () => {
    const result = resolveBeitragState({
      year: 2020,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
      faelligkeit: "2020-03-31",
      graceDays: 60,
    });
    // 2020 was more than 60 days ago → overdue
    expect(result.state).toBe("overdue");
  });

  it("open (not overdue): future faelligkeit", () => {
    const result = resolveBeitragState({
      year: 2099,
      eintrittsJahr: 2018,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
      faelligkeit: "2099-03-31",
      graceDays: 60,
    });
    expect(result.state).toBe("open");
  });
});
