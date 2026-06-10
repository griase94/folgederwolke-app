/**
 * transaction-kpi — shared German count-pluralisation for the tab KPIs (item 6).
 * Einnahmen + Spenden previously hardcoded the plural, giving "1 Buchungen" /
 * "1 Spenden"; these helpers fix the singular case in one place.
 *
 * Pure TS (no DB / no DOM) → normal vitest lane.
 */

import { describe, it, expect } from "vitest";
import {
  pluralizeCount,
  buchungenLabel,
  spendenLabel,
} from "./transaction-kpi.js";

describe("transaction-kpi pluralisation", () => {
  it("buchungenLabel: singular at 1, plural otherwise", () => {
    expect(buchungenLabel(1)).toBe("1 Buchung");
    expect(buchungenLabel(0)).toBe("0 Buchungen");
    expect(buchungenLabel(4)).toBe("4 Buchungen");
  });

  it("spendenLabel: singular at 1, plural otherwise", () => {
    expect(spendenLabel(1)).toBe("1 Spende");
    expect(spendenLabel(0)).toBe("0 Spenden");
    expect(spendenLabel(7)).toBe("7 Spenden");
  });

  it("pluralizeCount is the generic backing helper", () => {
    expect(pluralizeCount(1, "Beleg", "Belege")).toBe("1 Beleg");
    expect(pluralizeCount(3, "Beleg", "Belege")).toBe("3 Belege");
  });
});
