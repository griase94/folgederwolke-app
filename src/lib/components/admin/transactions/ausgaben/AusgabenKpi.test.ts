// AusgabenKpi.test.ts
//
// Component test for the Ausgaben list-header KPI strip (spec §7.1).
// The strip renders the tab title + total, and a "N offen · älteste X Tage"
// pill that DISAPPEARS when there are zero open Auslagen (the §7.1 delight:
// no nag when nothing is pending). When offen > 0 the pill shows the count
// and the oldest-open age in days.
//
// Reset lane (mounts no bits-ui, but kept on the component runner) →
// `pnpm test --run <file>`. Uses fireEvent (project convention; never userEvent).
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import AusgabenKpi from "./AusgabenKpi.svelte";

afterEach(() => cleanup());

describe("AusgabenKpi", () => {
  it("hides the offen pill when zero", () => {
    render(AusgabenKpi, {
      props: {
        totalCents: 842000,
        count: 47,
        offenCount: 0,
        oldestOpenAgeDays: null,
        year: 2026,
      },
    });
    expect(screen.queryByText(/offen/i)).toBeNull();
  });

  it("shows 'N offen · älteste X Tage' when > 0", () => {
    render(AusgabenKpi, {
      props: {
        totalCents: 842000,
        count: 47,
        offenCount: 3,
        oldestOpenAgeDays: 18,
        year: 2026,
      },
    });
    expect(screen.getByText(/3 offen/)).toBeTruthy();
    expect(screen.getByText(/18/)).toBeTruthy();
  });

  it("renders the tab title 'Ausgaben'", () => {
    render(AusgabenKpi, {
      props: {
        totalCents: 0,
        count: 0,
        offenCount: 0,
        oldestOpenAgeDays: null,
        year: 2026,
      },
    });
    expect(screen.getByText("Ausgaben")).toBeTruthy();
  });
});
