/**
 * Unit tests for Sparkline component — inline SVG, no external lib.
 *
 * Sparkline contract:
 *   - Accepts data: number[] (12 monthly values, in cents).
 *   - Renders <svg> with a single <polyline> connecting normalized points.
 *   - Renders a dot at the latest (last) data point.
 *   - Handles edge cases: all-zero, single non-zero, fewer than 12 points.
 *
 * Pure rendering — no derived state, no DB.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import Sparkline from "./Sparkline.svelte";

afterEach(() => cleanup());

describe("Sparkline", () => {
  it("renders an svg with a polyline", () => {
    render(Sparkline, {
      props: {
        data: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
      },
    });
    const svg = screen.getByTestId("sparkline");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const polyline = svg.querySelector("polyline");
    expect(polyline).toBeTruthy();
  });

  it("polyline contains one point per data value", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    render(Sparkline, { props: { data } });
    const polyline = screen
      .getByTestId("sparkline")
      .querySelector("polyline") as SVGPolylineElement;
    const points = polyline.getAttribute("points")?.trim().split(/\s+/) ?? [];
    expect(points.length).toBe(12);
  });

  it("renders a dot (circle) at the latest data point", () => {
    render(Sparkline, {
      props: { data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100] },
    });
    const circle = screen
      .getByTestId("sparkline")
      .querySelector("circle[data-role='sparkline-latest']");
    expect(circle).toBeTruthy();
  });

  it("normalizes points so min maps to bottom and max to top", () => {
    // monotonically increasing → first point should be at max y (bottom),
    // last at min y (top of viewBox)
    const data = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    render(Sparkline, { props: { data } });
    const polyline = screen
      .getByTestId("sparkline")
      .querySelector("polyline") as SVGPolylineElement;
    const pointsAttr = polyline.getAttribute("points") ?? "";
    const points = pointsAttr
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number));
    expect(points.length).toBe(12);
    const firstY = points[0]![1]!;
    const lastY = points[points.length - 1]![1]!;
    // Lower SVG y == higher on screen. Max value should have smaller y.
    expect(lastY).toBeLessThan(firstY);
  });

  it("handles all-zero data without throwing", () => {
    expect(() =>
      render(Sparkline, { props: { data: new Array(12).fill(0) } }),
    ).not.toThrow();
    const polyline = screen
      .getByTestId("sparkline")
      .querySelector("polyline");
    expect(polyline).toBeTruthy();
  });

  it("accepts a custom width/height", () => {
    render(Sparkline, {
      props: { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], width: 200, height: 60 },
    });
    const svg = screen.getByTestId("sparkline");
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 60");
  });

  it("uses neutral/positive class on a rising series", () => {
    render(Sparkline, {
      props: { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    });
    const svg = screen.getByTestId("sparkline");
    expect(svg.classList.contains("sparkline")).toBe(true);
  });

  it("renders with fewer than 12 points without crashing", () => {
    expect(() =>
      render(Sparkline, { props: { data: [1, 2, 3] } }),
    ).not.toThrow();
    const polyline = screen
      .getByTestId("sparkline")
      .querySelector("polyline") as SVGPolylineElement;
    const points = polyline.getAttribute("points")?.trim().split(/\s+/) ?? [];
    expect(points.length).toBe(3);
  });
});
