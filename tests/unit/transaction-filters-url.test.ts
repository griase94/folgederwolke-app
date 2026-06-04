// tests/unit/transaction-filters-url.test.ts
import { describe, it, expect } from "vitest";
import {
  parseFilterState,
  serializeFilterState,
} from "$lib/domain/transaction-filters.js";

describe("filter state URL round-trip + validation", () => {
  it("parses valid params for a tab", () => {
    const s = parseFilterState(
      "ausgaben",
      new URLSearchParams(
        "status=offen,geprueft&bezahltVon=member&q=miete&monat=5",
      ),
    );
    expect(s.enums.status).toEqual(["offen", "geprueft"]);
    expect(s.enums.bezahltVon).toEqual(["member"]);
    expect(s.search).toBe("miete");
    expect(s.enums.monat).toEqual(["5"]);
  });
  it("drops unknown/invalid values without throwing (Zod-validated)", () => {
    const s = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=bogus&betragMin=abc&unknownField=x"),
    );
    expect(s.enums.status ?? []).toEqual([]); // 'bogus' not an allowed status
    expect(s.amount.betragMin).toBeUndefined(); // 'abc' not a number
  });
  it("round-trips: serialize(parse(x)) yields equivalent params", () => {
    const params = new URLSearchParams(
      "status=offen&betragMin=1000&betragMax=5000&mitRechnung=true",
    );
    const round = new URLSearchParams(
      serializeFilterState("einnahmen", parseFilterState("einnahmen", params)),
    );
    expect(round.get("betragMin")).toBe("1000");
    expect(round.get("mitRechnung")).toBe("true");
  });
});
