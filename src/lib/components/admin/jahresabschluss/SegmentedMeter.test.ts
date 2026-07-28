import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import SegmentedMeter from "./SegmentedMeter.svelte";
import type { MeterSegment } from "./SegmentedMeter.svelte";

afterEach(() => cleanup());

// The ja-spenden meter: 7 ausgestellt / 4 ausstehend / 1 n.a.
const segments: MeterSegment[] = [
  { tone: "ok", count: 7, label: "ausgestellt" },
  { tone: "open", count: 4, label: "ausstehend" },
  { tone: "neutral", count: 1, label: "n. a." },
];

describe("SegmentedMeter", () => {
  it("renders one bar segment per non-zero count, widths from count", () => {
    const { container } = render(SegmentedMeter, { props: { segments } });
    const segs = container.querySelectorAll(".meter .mseg");
    expect(segs.length).toBe(3);
    expect((segs[0] as HTMLElement).style.flexGrow).toBe("7");
    expect((segs[1] as HTMLElement).style.flexGrow).toBe("4");
  });

  it("GOTCHA: the 'open/ausstehend' segment is neutral-open, never a warn tone", () => {
    const { container } = render(SegmentedMeter, { props: { segments } });
    const open = container.querySelector(".meter .mseg.open");
    expect(open).not.toBeNull();
    // it must NOT be styled as over/warn
    expect(container.querySelector(".meter .mseg.over")).toBeNull();
  });

  it("legend lists every state (incl. zero-count) but the bar omits empties", () => {
    const withZero: MeterSegment[] = [
      { tone: "ok", count: 12, label: "ausgestellt" },
      { tone: "open", count: 0, label: "ausstehend" },
    ];
    const { container } = render(SegmentedMeter, {
      props: { segments: withZero },
    });
    // bar: only the non-zero segment
    expect(container.querySelectorAll(".meter .mseg").length).toBe(1);
    // legend: both, incl. the zero
    expect(screen.getByText(/0 ausstehend/)).toBeTruthy();
  });
});
