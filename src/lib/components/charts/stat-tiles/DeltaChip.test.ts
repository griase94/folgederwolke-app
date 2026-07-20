/**
 * DeltaChip (dataviz stat-tiles) — the month-head cash-in/cash-out twin stub.
 * Guards the sizing math + the zero-guard (both sides 0 → no NaN, no stubs).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import DeltaChip from "./DeltaChip.svelte";

afterEach(() => cleanup());

function rects(container: HTMLElement): SVGRectElement[] {
  return Array.from(container.querySelectorAll("rect"));
}

describe("DeltaChip", () => {
  it("renders both stubs when both sides are positive (up=einnahme, down=ausgabe)", () => {
    const { container } = render(DeltaChip, {
      props: { cashInCents: 10000, cashOutCents: 10000 },
    });
    const r = rects(container);
    expect(r.length).toBe(2);
    const fills = r.map((el) => el.getAttribute("fill") ?? "");
    expect(fills.some((f) => f.includes("type-einnahme"))).toBe(true);
    expect(fills.some((f) => f.includes("type-ausgabe"))).toBe(true);
  });

  it("omits the down stub when there is no cash-out", () => {
    const { container } = render(DeltaChip, {
      props: { cashInCents: 5000, cashOutCents: 0 },
    });
    const r = rects(container);
    expect(r.length).toBe(1);
    expect(r[0]!.getAttribute("fill")).toContain("type-einnahme");
  });

  it("omits the up stub when there is no cash-in", () => {
    const { container } = render(DeltaChip, {
      props: { cashInCents: 0, cashOutCents: 5000 },
    });
    const r = rects(container);
    expect(r.length).toBe(1);
    expect(r[0]!.getAttribute("fill")).toContain("type-ausgabe");
  });

  it("renders NO stubs and no NaN when both sides are zero (div-by-zero guard)", () => {
    const { container } = render(DeltaChip, {
      props: { cashInCents: 0, cashOutCents: 0 },
    });
    expect(rects(container).length).toBe(0);
    // The zero line is always present; its coords must be finite numbers.
    const line = container.querySelector("line")!;
    expect(Number(line.getAttribute("y1"))).toBe(6);
  });

  it("sizes the taller stub for the larger side on a shared scale", () => {
    const { container } = render(DeltaChip, {
      props: { cashInCents: 10000, cashOutCents: 2000 },
    });
    const r = rects(container);
    const einnahme = r.find((el) =>
      el.getAttribute("fill")?.includes("einnahme"),
    )!;
    const ausgabe = r.find((el) =>
      el.getAttribute("fill")?.includes("ausgabe"),
    )!;
    expect(Number(einnahme.getAttribute("height"))).toBeGreaterThan(
      Number(ausgabe.getAttribute("height")),
    );
    // The larger side pins to the max stub height (5 of the 12-tall box).
    expect(Number(einnahme.getAttribute("height"))).toBe(5);
  });
});
