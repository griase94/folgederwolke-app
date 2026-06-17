// tests/unit/transaction-filters-registry.test.ts
import { describe, it, expect } from "vitest";
import {
  FILTER_REGISTRY,
  parseFilterState,
  type TabKey,
} from "$lib/domain/transaction-filters.js";

describe("filter registry", () => {
  it("declares fields per tab with a typed shape", () => {
    for (const tab of ["ausgaben", "einnahmen", "spenden"] as TabKey[]) {
      const fields = FILTER_REGISTRY[tab];
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(typeof f.key).toBe("string");
        expect(typeof f.label).toBe("string");
        expect([
          "enum-multi",
          "member-picker",
          "date-range",
          "amount-range",
          "boolean",
        ]).toContain(f.type);
      }
    }
  });
  it("ausgaben has status + bezahltVon; einnahmen has mitRechnung; spenden has spendenart + bescheinigung", () => {
    const keys = (t: TabKey) => FILTER_REGISTRY[t].map((f) => f.key);
    expect(keys("ausgaben")).toEqual(
      expect.arrayContaining([
        "status",
        "bezahltVon",
        "kategorie",
        "monat",
        "betrag",
        "belegFehlt",
      ]),
    );
    expect(keys("einnahmen")).toEqual(
      expect.arrayContaining([
        "kategorie",
        "sphaere",
        "mitRechnung",
        "monat",
        "betrag",
      ]),
    );
    expect(keys("spenden")).toEqual(
      expect.arrayContaining([
        "spendenart",
        "zweckbindung",
        "bescheinigung",
        "spender",
        "monat",
        "betrag",
      ]),
    );
  });

  it("transaktionen feed tab: parses ?typ= (single + comma list + q) and drops junk values", () => {
    const s1 = parseFilterState(
      "transaktionen",
      new URLSearchParams("typ=spenden&q=beleg"),
    );
    expect(s1.enums.typ).toEqual(["spenden"]);
    expect(s1.search).toBe("beleg");

    const s2 = parseFilterState(
      "transaktionen",
      new URLSearchParams("typ=ausgaben,einnahmen"),
    );
    expect(s2.enums.typ).toEqual(["ausgaben", "einnahmen"]);

    const s3 = parseFilterState(
      "transaktionen",
      new URLSearchParams("typ=bogus"),
    );
    expect(s3.enums.typ).toBeUndefined();
  });
});
