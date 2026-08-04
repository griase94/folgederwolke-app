/**
 * StatCard / StatCardStrip — the one static stat primitive (spec §8, DESIGN-
 * GUIDELINES §2.6).
 *
 * Guards the anatomy that three drifted local tiles used to break: the accent
 * column is always occupied, the hue never lands on the number, the value is
 * the number alone, empty counts keep their dignity, and the rail is the SAME
 * strip on a different axis (AC19) rather than a second component.
 */
import { render, cleanup, screen } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import StatCard from "./StatCard.svelte";
import StripHarness from "./StatCardStrip.test.svelte";

afterEach(() => cleanup());

const base = {
  label: "Summe Spenden",
  value: "1.250,00 €",
  format: "money" as const,
};

describe("StatCard — anatomy", () => {
  it("renders label, value and the accent dot in that order", () => {
    const { container } = render(StatCard, {
      props: { ...base, accent: "var(--type-spende)" },
    });
    const card = container.querySelector<HTMLElement>(
      '[data-slot="stat-card"]',
    )!;
    expect(card).toBeTruthy();
    expect(card.dataset["format"]).toBe("money");
    expect(screen.getByText("Summe Spenden")).toBeTruthy();
    expect(screen.getByText("1.250,00 €")).toBeTruthy();
  });

  it("always paints an accent dot — neutral ink-300 when no identity hue applies", () => {
    const { container } = render(StatCard, { props: base });
    const dot = container.querySelector<HTMLElement>(
      '[data-slot="stat-card"] span[aria-hidden]',
    )!;
    expect(dot.className).toContain("bg-ink-300");
    expect(dot.className).toContain("rounded-full");
  });

  it("puts the identity hue on the dot, never on the number", () => {
    const { container } = render(StatCard, {
      props: { ...base, accent: "var(--type-spende)" },
    });
    const dot = container.querySelector<HTMLElement>(
      '[data-slot="stat-card"] span[aria-hidden]',
    )!;
    expect(dot.getAttribute("style")).toContain("var(--type-spende)");
    const value = screen.getByText("1.250,00 €");
    expect(value.className).toContain("text-ink-900");
    expect(value.getAttribute("style")).toBeNull();
  });

  it("keeps the value tabular so a strip column aligns", () => {
    render(StatCard, { props: base });
    expect(screen.getByText("1.250,00 €").className).toContain("tabular-nums");
  });

  it("empty dignity: dims the value, keeps the dot, marks the card", () => {
    const { container } = render(StatCard, {
      props: {
        label: "Anzahl",
        value: "0",
        format: "count" as const,
        sub: "Noch keine Spenden in 2026",
        empty: true,
      },
    });
    const card = container.querySelector<HTMLElement>(
      '[data-slot="stat-card"]',
    )!;
    expect(card.dataset["empty"]).toBe("");
    const value = screen.getByText("0");
    expect(value.className).toContain("text-ink-500");
    expect(value.className).not.toContain("text-ink-900");
    expect(container.querySelector("span[aria-hidden]")).toBeTruthy();
    expect(screen.getByText("Noch keine Spenden in 2026")).toBeTruthy();
  });

  it("renders as a link only when href is given", () => {
    const { container, unmount } = render(StatCard, { props: base });
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector('div[data-slot="stat-card"]')).toBeTruthy();
    unmount();

    const { container: linked } = render(StatCard, {
      props: { ...base, href: "/app/einnahmen?sphaere=ideeller" },
    });
    const a = linked.querySelector<HTMLAnchorElement>(
      'a[data-slot="stat-card"]',
    )!;
    expect(a.getAttribute("href")).toBe("/app/einnahmen?sphaere=ideeller");
    expect(a.className).toContain("focus-visible:ring-2");
  });

  it("uses the card surface by default and no surface in the bare variant", () => {
    const { container, unmount } = render(StatCard, { props: base });
    expect(
      container.querySelector('[data-slot="stat-card"]')!.className,
    ).toContain("bg-card");
    unmount();
    const { container: bare } = render(StatCard, {
      props: { ...base, variant: "bare" as const },
    });
    const card = bare.querySelector('[data-slot="stat-card"]')!;
    expect(card.className).not.toContain("bg-card");
    expect(card.className).not.toContain("border-border");
  });
});

describe("StatCardStrip — axis (spec §8 AC19)", () => {
  it("is a 2-col grid on mobile and an equal-width row from md", () => {
    const { container } = render(StripHarness, { props: {} });
    const strip = container.querySelector<HTMLElement>(
      '[data-slot="stat-card-strip"]',
    )!;
    expect(strip.dataset["orientation"]).toBe("horizontal");
    expect(strip.className).toContain("grid-cols-2");
    expect(strip.className).toContain("md:flex");
  });

  it("the rail is the SAME strip on a different axis — no second component, no second DOM copy", () => {
    const { container } = render(StripHarness, {
      props: { orientation: "rail" as const },
    });
    const strip = container.querySelector<HTMLElement>(
      '[data-slot="stat-card-strip"]',
    )!;
    // Below the rail breakpoint it is byte-identical to the horizontal strip …
    expect(strip.className).toContain("grid-cols-2");
    expect(strip.className).toContain("md:flex");
    // … and only the container flips axis at 2240px.
    expect(strip.className).toContain("rail:flex-col");
    // Exactly one copy of each card exists (a duplicated strip would break
    // every selector that expects a single match).
    expect(container.querySelectorAll('[data-slot="stat-card"]').length).toBe(
      2,
    );
  });

  it("names the group only when a label is given", () => {
    const { container, unmount } = render(StripHarness, { props: {} });
    expect(
      container
        .querySelector('[data-slot="stat-card-strip"]')!
        .getAttribute("role"),
    ).toBeNull();
    unmount();
    const { container: named } = render(StripHarness, {
      props: { label: "Spenden-Kennzahlen" },
    });
    const strip = named.querySelector('[data-slot="stat-card-strip"]')!;
    expect(strip.getAttribute("role")).toBe("group");
    expect(strip.getAttribute("aria-label")).toBe("Spenden-Kennzahlen");
  });
});
