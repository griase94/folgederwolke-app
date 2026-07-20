/**
 * KpiStrip — the responsive tile-row layout for a type-list KPI header.
 * Renders its children and forwards data-* attributes (the sphere-split marker).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/svelte";
import KpiStripHarness from "./KpiStrip.test.svelte";

afterEach(() => cleanup());

describe("KpiStrip", () => {
  it("renders its tile children", () => {
    render(KpiStripHarness, {});
    expect(screen.getAllByTestId("strip-child").length).toBe(2);
  });

  it("forwards data-slot onto the root (Einnahmen sphere-split marker)", () => {
    const { container } = render(KpiStripHarness, {
      props: { dataSlot: "sphere-split" },
    });
    expect(container.querySelector('[data-slot="sphere-split"]')).toBeTruthy();
  });
});
