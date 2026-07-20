import { describe, it, expect } from "vitest";
import {
  barRight,
  barLeft,
  barUp,
  niceStep,
  niceAxis,
  ringDash,
  gaugePoint,
  gaugeArc,
  monotonePath,
  linePath,
  clamp,
} from "./geometry.js";

describe("dataviz geometry", () => {
  it("barRight is square at the baseline, rounded at the data end", () => {
    const d = barRight(0, 0, 100, 20);
    // opens at the square left edge, closes with a quadratic (rounded) right end
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d).toContain("Q");
    expect(d.trimEnd().endsWith("Z")).toBe(true);
  });

  it("barLeft grows the other way for a deficit, still one form", () => {
    const d = barLeft(100, 0, 40, 20);
    expect(d).toContain("Q");
    expect(d).toContain("Z");
  });

  it("bar radius never exceeds half the bar width (tiny bars stay clean)", () => {
    // a 2px-wide bar must not request a 4px corner
    expect(() => barUp(0, 24, 8, 10)).not.toThrow();
    expect(barRight(0, 0, 1, 20)).toContain("Z");
  });

  it("niceStep picks round increments", () => {
    expect(niceStep(3300)).toBe(5000);
    expect(niceStep(180)).toBe(200);
  });

  it("niceAxis grows left of zero for a deficit floor", () => {
    const pos = niceAxis(8240);
    expect(pos.min).toBe(0);
    expect(pos.max).toBeGreaterThanOrEqual(8240);
    const def = niceAxis(8240, -520);
    expect(def.min).toBeLessThan(0);
  });

  it("ringDash leaves (100-pct) of the ring as offset", () => {
    const { circumference, offset } = ringDash(33, 85);
    expect(circumference).toBeCloseTo(2 * Math.PI * 33, 3);
    expect(offset).toBeCloseTo(circumference * 0.15, 3);
    // clamps over-100
    expect(ringDash(33, 130).offset).toBeCloseTo(0, 6);
  });

  it("gauge maps fraction 0→left, 1→right, 0.5→apex", () => {
    const [lx, ly] = gaugePoint(200, 208, 166, 0);
    expect(lx).toBeCloseTo(34, 3);
    expect(ly).toBeCloseTo(208, 3);
    const [rx] = gaugePoint(200, 208, 166, 1);
    expect(rx).toBeCloseTo(366, 3);
    const [, apexY] = gaugePoint(200, 208, 166, 0.5);
    expect(apexY).toBeCloseTo(42, 3);
    expect(gaugeArc(200, 208, 166, 0, 0.315)).toMatch(/^M.*A166,166/);
  });

  it("monotonePath produces a cubic through all points; single point degrades to a move", () => {
    const p = monotonePath([
      [0, 0],
      [10, 5],
      [20, 2],
    ]);
    expect(p).toContain("C");
    expect(linePath([[3, 4]])).toBe("M3,4");
  });

  it("clamp bounds a value", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
