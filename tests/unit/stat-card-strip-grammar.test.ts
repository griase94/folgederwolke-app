/**
 * Strip grammar — the app-wide discipline every StatCardStrip must keep
 * (spec §8 "STRIP-DISZIPLIN", DESIGN-GUIDELINES §2.6).
 *
 * This runs against the REAL migrated strips, not a fixture, so the rules stay
 * true as the surfaces evolve:
 *
 *  1. the accent column is always occupied — every card has its dot;
 *  2. the value is the NUMBER ALONE. "0 versandt" was the original Andy
 *     finding: a label inside the value makes a strip unreadable as a column
 *     of figures. The only words a value may contain are the ratio's "von";
 *  3. sub-lines are all-or-none within one strip (a lone sub reads as a
 *     dangling note);
 *  4. money in one strip shares one decimal discipline — every amount carries
 *     its cents, none is rounded to whole euros.
 */
import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import { SPHERE_DOT_CLASSES } from "$lib/components/admin/transactions/fields/SphereBadge.svelte";
import { SPHERES } from "$lib/domain/sphere.js";
import SpendenKpi from "$lib/components/admin/transactions/spenden/SpendenKpi.svelte";
import AusgabenKpi from "$lib/components/admin/transactions/ausgaben/AusgabenKpi.svelte";
import EinnahmenKpi from "$lib/components/admin/transactions/einnahmen/EinnahmenKpi.svelte";

afterEach(() => cleanup());

/** A value may hold digits, German separators, a currency/percent sign, a real
 *  minus — and, for a ratio, the single word "von". Nothing else. */
const VALUE_GRAMMAR =
  /^[\d.,\s%€−+-]*(?:\d\s+von\s+\d[\d.,\s]*)?[\d.,\s%€−+-]*$/u;

function assertStripGrammar(container: HTMLElement, name: string) {
  const strips = container.querySelectorAll<HTMLElement>(
    '[data-slot="stat-card-strip"]',
  );
  expect(strips.length, `${name}: renders at least one strip`).toBeGreaterThan(
    0,
  );

  for (const strip of strips) {
    const cards = Array.from(
      strip.querySelectorAll<HTMLElement>('[data-slot="stat-card"]'),
    );
    expect(cards.length, `${name}: strip has cards`).toBeGreaterThan(0);

    const subs: boolean[] = [];
    const monies: string[] = [];

    for (const card of cards) {
      const spans = Array.from(card.children) as HTMLElement[];
      // 1 — accent column occupied.
      const dot = card.querySelector("span[aria-hidden]");
      expect(dot, `${name}: every card carries an accent dot`).toBeTruthy();

      // 2 — value is the number alone.
      const value = spans.find((s) => s.className.includes("tabular-nums"))!;
      const text = value.textContent!.trim();
      expect(
        VALUE_GRAMMAR.test(text),
        `${name}: value "${text}" must be a number, never a label-in-value`,
      ).toBe(true);

      subs.push(
        spans.some((s) => s.className.includes("text-[11px]") && s !== value),
      );
      if (card.dataset["format"] === "money") monies.push(text);
    }

    // 3 — subs all-or-none.
    expect(
      new Set(subs).size,
      `${name}: sub-lines must be all-or-none within a strip`,
    ).toBe(1);

    // 4 — one decimal discipline for money.
    if (monies.length > 1) {
      const withCents = monies.map((m) => /,\d{2}/.test(m));
      expect(
        new Set(withCents).size,
        `${name}: money tiles must share one decimal discipline (${monies.join(" | ")})`,
      ).toBe(1);
    }
  }
}

describe("StatCardStrip grammar — the migrated strips", () => {
  it("SpendenKpi (M1)", () => {
    const { container } = render(SpendenKpi, {
      props: {
        totalCents: 250000,
        count: 12,
        ohneBescheinigungCount: 3,
        versandtCount: 9,
        year: 2026,
      },
    });
    assertStripGrammar(container, "SpendenKpi");
  });

  it("SpendenKpi (M1) — empty year keeps its dignity", () => {
    const { container } = render(SpendenKpi, {
      props: {
        totalCents: 0,
        count: 0,
        ohneBescheinigungCount: 0,
        versandtCount: 0,
        year: 2026,
      },
    });
    assertStripGrammar(container, "SpendenKpi (leer)");
    const cards = container.querySelectorAll(
      '[data-slot="stat-card"][data-empty]',
    );
    expect(cards.length, "every card of an empty year is dimmed").toBe(3);
    expect(container.textContent).toContain("Noch keine Spenden in 2026");
  });

  it("AusgabenKpi (M2)", () => {
    const { container } = render(AusgabenKpi, {
      props: {
        totalCents: 842000,
        count: 47,
        erstattetCount: 5,
        offenCount: 3,
        oldestOpenAgeDays: 18,
        year: 2026,
      },
    });
    assertStripGrammar(container, "AusgabenKpi");
  });

  it("AusgabenKpi (M2) — 'Erstattet' is a neutral metric, not Einnahme-green", () => {
    const { container } = render(AusgabenKpi, {
      props: {
        totalCents: 842000,
        count: 47,
        erstattetCount: 5,
        offenCount: 0,
        oldestOpenAgeDays: null,
        year: 2026,
      },
    });
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="stat-card"]'),
    );
    const erstattet = cards.find((c) => c.textContent!.includes("Erstattet"))!;
    const dot = erstattet.querySelector<HTMLElement>("span[aria-hidden]")!;
    expect(dot.getAttribute("style") ?? "").not.toContain("einnahme");
    expect(dot.className).toContain("bg-ink-300");
  });

  it("EinnahmenKpi (M3)", () => {
    const { container } = render(EinnahmenKpi, {
      props: {
        totalCents: 125000,
        count: 12,
        bySphere: {
          ideeller: 80000,
          vermoegen: 0,
          zweckbetrieb: 30000,
          wirtschaftlich: 15000,
        },
        year: 2026,
      },
    });
    assertStripGrammar(container, "EinnahmenKpi");
  });
});

describe("sphere identity on stat cards", () => {
  /**
   * The dataviz `--sphere-*` variables are a SERIES palette, not the §13
   * identity — ideeller is green there and pink here. A card fed from the
   * dataviz vars would state a different Sphäre than the SphereBadge beside it,
   * which is the same class of bug as the Jahresabschluss colour swap (S7).
   */
  it("takes its dots from SPHERE_DOT_CLASSES, never from the dataviz palette", () => {
    const { container } = render(EinnahmenKpi, {
      props: {
        totalCents: 125000,
        count: 12,
        bySphere: {
          ideeller: 80000,
          vermoegen: 0,
          zweckbetrieb: 30000,
          wirtschaftlich: 15000,
        },
        year: 2026,
      },
    });
    for (const sphere of SPHERES) {
      const card = container.querySelector<HTMLElement>(
        `[data-sphere-chip][data-sphere="${sphere}"]`,
      )!;
      const dot = card.querySelector<HTMLElement>("span[aria-hidden]")!;
      expect(dot.className, `${sphere} dot`).toContain(
        SPHERE_DOT_CLASSES[sphere],
      );
      // No inline colour: the hue must carry its own dark-mode variant.
      expect(dot.getAttribute("style")).toBeNull();
    }
  });
});
