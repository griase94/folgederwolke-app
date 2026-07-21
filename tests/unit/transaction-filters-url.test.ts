// tests/unit/transaction-filters-url.test.ts
import { describe, it, expect } from "vitest";
import {
  parseFilterState,
  serializeFilterState,
  listQueryString,
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

describe("listQueryString (B-Kulisse stage continuity)", () => {
  it("keeps the list params (search/sort/dir/page/year/amount/filters)", () => {
    const q = listQueryString(
      "ausgaben",
      new URLSearchParams(
        "q=miete&sort=betrag&dir=asc&page=2&year=2025&betragMin=1000&status=offen",
      ),
    );
    const p = new URLSearchParams(q);
    expect(p.get("q")).toBe("miete");
    expect(p.get("sort")).toBe("betrag");
    expect(p.get("dir")).toBe("asc");
    expect(p.get("page")).toBe("2");
    expect(p.get("year")).toBe("2025");
    expect(p.get("betragMin")).toBe("1000");
    expect(p.get("status")).toBe("offen");
  });

  it("drops the /neu PREFILL keys — projectId is prefill-only, never a filter", () => {
    const q = listQueryString(
      "ausgaben",
      new URLSearchParams(
        "sort=betrag&projectId=abc&bezeichnung=Miete&betragCents=4500&kategorieNameSnapshot=Raum&bezahltVonKind=verein&externName=X",
      ),
    );
    const p = new URLSearchParams(q);
    // The one real list param survives …
    expect(p.get("sort")).toBe("betrag");
    // … and every prefill key is dropped (no filter-vs-prefill collision).
    expect(p.has("projectId")).toBe(false);
    expect(p.has("bezeichnung")).toBe(false);
    expect(p.has("betragCents")).toBe(false);
    expect(p.has("kategorieNameSnapshot")).toBe(false);
    expect(p.has("bezahltVonKind")).toBe(false);
    expect(p.has("externName")).toBe(false);
  });

  it("returns '' (no leading ?) when no list params are present", () => {
    expect(
      listQueryString("spenden", new URLSearchParams("projectId=abc")),
    ).toBe("");
    expect(listQueryString("einnahmen", new URLSearchParams())).toBe("");
  });

  it("prefixes with ? when list params exist", () => {
    expect(
      listQueryString("spenden", new URLSearchParams("spendenart=geldspende")),
    ).toBe("?spendenart=geldspende");
  });
});
