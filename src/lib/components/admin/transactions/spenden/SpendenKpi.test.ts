/**
 * Task 2 — SpendenKpi strip (spec §9.1).
 *
 * Quiet anchor (Jahr|Alle · Summe · N Spenden) + a disappearing
 * "N ohne Bescheinigung" pill (ABSENT when ohneBescheinigungCount === 0 — the
 * §9.1 delight) + "M Bescheinigungen versandt". No Sammelbestätigungs-Fenster.
 */

import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import SpendenKpi from "./SpendenKpi.svelte";

afterEach(() => cleanup());

describe("SpendenKpi", () => {
  it("hides the ohne-Bescheinigung pill when zero", () => {
    render(SpendenKpi, {
      props: {
        totalCents: 250000,
        count: 12,
        ohneBescheinigungCount: 0,
        versandtCount: 12,
        year: 2026,
      },
    });
    expect(screen.queryByText(/ohne Bescheinigung/i)).toBeNull();
  });

  it("shows 'N ohne Bescheinigung' + 'M versandt' when > 0", () => {
    render(SpendenKpi, {
      props: {
        totalCents: 250000,
        count: 12,
        ohneBescheinigungCount: 3,
        versandtCount: 9,
        year: 2026,
      },
    });
    expect(screen.getByText(/3 ohne Bescheinigung/)).toBeTruthy();
    expect(screen.getByText(/9 .*versandt/i)).toBeTruthy();
  });

  it("renders the year anchor + Spenden count", () => {
    render(SpendenKpi, {
      props: {
        totalCents: 250000,
        count: 12,
        ohneBescheinigungCount: 0,
        versandtCount: 12,
        year: 2026,
      },
    });
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.getByText(/12 Spenden/)).toBeTruthy();
  });

  it("uses the singular 'Spende' at a count of 1 (item 6 — was '1 Spenden')", () => {
    render(SpendenKpi, {
      props: {
        totalCents: 25000,
        count: 1,
        ohneBescheinigungCount: 0,
        versandtCount: 1,
        year: 2026,
      },
    });
    expect(screen.getByText(/· 1 Spende(?!n)/)).toBeTruthy();
  });
});
