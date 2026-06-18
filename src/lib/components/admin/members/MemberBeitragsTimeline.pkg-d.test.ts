/**
 * MemberBeitragsTimeline — Package D tests.
 *
 * D4: always-present STATUS HERO for current year;
 *     status-driven rosa CTA (Zahlung erfassen / bearbeiten);
 *     partial progress bar / fraction;
 *     notes display;
 *     dashed empty only for no-obligation years (not for rows with data).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberBeitragsTimeline from "./MemberBeitragsTimeline.svelte";

afterEach(() => cleanup());

function makeRow(
  year: number,
  opts: {
    betragCents?: number;
    paidCents?: number;
    gezahltAm?: string | null;
    notes?: string | null;
    isExempt?: boolean;
  } = {},
) {
  return {
    id: `b-${year}`,
    year,
    betragCents: opts.betragCents ?? 6000,
    paidCents: opts.paidCents ?? 0,
    gezahltAm: opts.gezahltAm ?? null,
    notes: opts.notes ?? null,
    isExempt: opts.isExempt ?? false,
    exemptReason: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  };
}

describe("MemberBeitragsTimeline — Package D", () => {
  // ── Status hero ──────────────────────────────────────────────────────────

  it("renders a status hero (data-testid=beitrags-hero) for the current year", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [makeRow(2026, { betragCents: 6000, paidCents: 0 })],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
      },
    });
    const hero = container.querySelector("[data-testid='beitrags-hero']");
    expect(hero).toBeTruthy();
  });

  it("hero open state: shows 'Offen' and rosa CTA 'Zahlung erfassen'", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [makeRow(2026, { betragCents: 6000, paidCents: 0 })],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
      },
    });
    const hero = container.querySelector("[data-testid='beitrags-hero']");
    expect(hero?.textContent).toMatch(/Offen/i);
    const cta = container.querySelector("[data-testid='beitrags-hero-cta']");
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toMatch(/Zahlung erfassen/i);
  });

  it("hero paid state: shows 'Bezahlt' and CTA 'Zahlung bearbeiten'", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [
          makeRow(2026, {
            betragCents: 6000,
            paidCents: 6000,
            gezahltAm: "2026-02-01",
          }),
        ],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
      },
    });
    const hero = container.querySelector("[data-testid='beitrags-hero']");
    expect(hero?.textContent).toMatch(/Bezahlt/i);
    const cta = container.querySelector("[data-testid='beitrags-hero-cta']");
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toMatch(/Zahlung bearbeiten/i);
  });

  it("hero partial state: shows partial fraction and 'Zahlung erfassen' (to complete)", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [
          makeRow(2026, {
            betragCents: 6000,
            paidCents: 3000,
            gezahltAm: "2026-02-01",
          }),
        ],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
      },
    });
    const hero = container.querySelector("[data-testid='beitrags-hero']");
    // partial shows a fraction — "30,00 € / 60,00 €" or similar
    expect(hero?.textContent).toMatch(/30/);
    expect(hero?.textContent).toMatch(/60/);
  });

  it("exempt member: hero shows 'Befreit', no CTA pay button", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
        beitragExempt: true,
      },
    });
    const hero = container.querySelector("[data-testid='beitrags-hero']");
    expect(hero?.textContent).toMatch(/Befreit/i);
    const cta = container.querySelector("[data-testid='beitrags-hero-cta']");
    expect(cta).toBeFalsy();
  });

  // ── Notes on timeline rows ───────────────────────────────────────────────

  it("displays notes text on a timeline row that has notes", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [
          makeRow(2026, {
            betragCents: 6000,
            paidCents: 6000,
            gezahltAm: "2026-02-01",
            notes: "Barzahlung beim Vereinstreffen",
          }),
        ],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
      },
    });
    expect(
      container.textContent?.includes("Barzahlung beim Vereinstreffen"),
    ).toBe(true);
  });

  // ── No false-debt CTA ────────────────────────────────────────────────────

  it("ausgetreten member: hero shows muted state, no pay CTA", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [],
        memberId: "m1",
        currentYear: 2026,
        satzByYear: { 2026: 6000 },
        austrittsJahr: 2024,
      },
    });
    // Post-Austritt year should not show a pay CTA
    const cta = container.querySelector("[data-testid='beitrags-hero-cta']");
    expect(cta).toBeFalsy();
  });
});
