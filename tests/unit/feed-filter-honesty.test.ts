/**
 * The feed's honesty rule (spec §5).
 *
 * Two of the feed's filter fields cannot describe all three UNION arms:
 * Kategorie is offered as the Einnahmen ∪ Ausgaben snapshot names (a donation's
 * Kategorie is derived and never in that list), and "Beleg fehlt" is an
 * expense-only flag. The rule is that such a field REMOVES the arm it cannot
 * describe and the UI says so — never a silent zero the user would read as
 * "there are no donations".
 */
import { describe, it, expect } from "vitest";
import {
  feedKindsSupported,
  feedKindsSelected,
  feedExclusionHint,
  type FilterState,
} from "$lib/domain/transaction-filters.js";

const empty: FilterState = {
  enums: {},
  members: {},
  amount: {},
  booleans: {},
};
const withState = (patch: Partial<FilterState>): FilterState => ({
  ...empty,
  ...patch,
});

describe("feedKindsSupported", () => {
  it("spans all four arms when nothing arm-specific is filtered", () => {
    expect([...feedKindsSupported(empty)].sort()).toEqual([
      "beitrag",
      "donation",
      "expense",
      "income",
    ]);
  });

  it("drops donations AND Beiträge while a Kategorie is picked", () => {
    // Neither can match: a donation's Kategorie is derived, and a Beitrag has
    // none at all. The option list is the Einnahmen ∪ Ausgaben snapshot names.
    const s = withState({ enums: { kategorie: ["Bürobedarf"] } });
    expect(feedKindsSupported(s).has("donation")).toBe(false);
    expect(feedKindsSupported(s).has("beitrag")).toBe(false);
    expect(feedKindsSupported(s).has("expense")).toBe(true);
    expect(feedKindsSupported(s).has("income")).toBe(true);
  });

  it("narrows to expenses while 'Beleg fehlt' is on", () => {
    const s = withState({ booleans: { belegFehlt: true } });
    expect([...feedKindsSupported(s)]).toEqual(["expense"]);
  });

  it("leaves all arms in place for fields that mean the same everywhere", () => {
    for (const s of [
      withState({ enums: { monat: ["3"] } }),
      // Sphäre stays here on purpose: a Beitrag is always ideeller, so the
      // field CAN describe it. Picking another sphere yields an honest zero
      // rather than an excluded arm.
      withState({ enums: { sphaere: ["zweckbetrieb"] } }),
      withState({ amount: { betragMin: 1000 } }),
      withState({ search: "miete" }),
    ]) {
      expect(feedKindsSupported(s).size).toBe(4);
    }
  });
});

describe("feedKindsSelected", () => {
  it("is the typ chips when they are compatible", () => {
    const s = withState({ enums: { typ: ["einnahmen"] } });
    expect([...feedKindsSelected(s)]).toEqual(["income"]);
  });

  it("intersects the chips with the supported arms — never resurrects a dropped one", () => {
    const s = withState({
      enums: { typ: ["spenden"], kategorie: ["Bürobedarf"] },
    });
    expect([...feedKindsSelected(s)]).toEqual([]);
  });

  it("falls back to every supported arm when no chip is active", () => {
    const s = withState({ booleans: { belegFehlt: true } });
    expect([...feedKindsSelected(s)]).toEqual(["expense"]);
  });
});

describe("feedExclusionHint", () => {
  it("stays silent when nothing is excluded", () => {
    expect(feedExclusionHint(empty)).toBeNull();
    expect(
      feedExclusionHint(withState({ enums: { monat: ["3"] } })),
    ).toBeNull();
  });

  it("names the excluded arms rather than the mechanism", () => {
    const kat = feedExclusionHint(
      withState({ enums: { kategorie: ["Bürobedarf"] } }),
    );
    expect(kat).toContain("Spenden");
    expect(kat).toContain("Einnahmen & Ausgaben");

    const beleg = feedExclusionHint(
      withState({ booleans: { belegFehlt: true } }),
    );
    expect(beleg).toContain("Ausgaben");
    expect(beleg).toContain("ausgeblendet");
  });
});
