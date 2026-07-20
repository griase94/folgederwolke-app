import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ProgressRing from "./ProgressRing.svelte";
import AgingRail from "./AgingRail.svelte";
import ZoneMeter from "./ZoneMeter.svelte";
import CompareBars from "./CompareBars.svelte";
import MiniSparkline from "./MiniSparkline.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

describe("stat-tiles mini-vizzes", () => {
  it("ProgressRing arc offset encodes the paid fraction", () => {
    render(ProgressRing, { props: { value: 17, total: 20 } });
    const svg = screen.getByTestId("progress-ring");
    // 85 % → 15 % of the circumference remains as the dash offset
    const arc = svg.querySelectorAll("circle")[1]!;
    const c = 2 * Math.PI * 33;
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      c * 0.15,
      1,
    );
    expect(svg.getAttribute("aria-label")).toContain("17 von 20");
  });

  it("AgingRail marks overdue past the Frist", () => {
    render(AgingRail, { props: { daysOld: 38, fristDays: 30 } });
    expect(
      screen.getByTestId("aging-rail").getAttribute("aria-label"),
    ).toContain("überfällig");
  });

  it("ZoneMeter labels the cap from cents", () => {
    render(ZoneMeter, { props: { valueCents: 1395000, capCents: 5000000 } });
    expect(nb(screen.getByTestId("zone-meter").textContent)).toContain(
      "50.000 €",
    );
  });

  it("CompareBars prints both euro figures", () => {
    render(CompareBars, {
      props: { einnahmenCents: 1248000, ausgabenCents: 884000 },
    });
    const t = nb(screen.getByTestId("compare-bars").textContent);
    expect(t).toContain("12.480 €");
    expect(t).toContain("8.840 €");
  });

  it("MiniSparkline renders a path and never divides by zero on a flat series", () => {
    expect(() =>
      render(MiniSparkline, { props: { series: [0, 0, 0, 0] } }),
    ).not.toThrow();
    render(MiniSparkline, { props: { series: [1, 2, 3, 4, 5] } });
    expect(screen.getAllByTestId("mini-sparkline").length).toBeGreaterThan(0);
  });
});
