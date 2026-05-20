/**
 * @phase-2
 *
 * C1 cycle 4 — Buchungsliste filter + sort helpers.
 */

import { describe, it, expect } from "vitest";
import {
  parseBuchungslisteFilters,
  filterAndSortRows,
  type BuchungslisteRow,
} from "$lib/server/eur/buchungsliste.js";

function makeRow(over: Partial<BuchungslisteRow> = {}): BuchungslisteRow {
  return {
    id: "row-1",
    kind: "expense",
    businessId: "A-2025-001",
    bezeichnung: "Test",
    betragCents: 10000,
    gebuchtAm: "2025-06-15",
    sphereSnapshot: "ideeller",
    kategorieId: "k1",
    kategorieNameSnapshot: "Bürobedarf",
    projectId: null,
    belegDriveFileId: null,
    festgeschriebenAt: null,
    ...over,
  };
}

describe("parseBuchungslisteFilters", () => {
  it("defaults to date-desc sort", () => {
    const sp = new URLSearchParams();
    const f = parseBuchungslisteFilters(sp);
    expect(f.sort).toBe("date-desc");
  });

  it("accepts known sort values", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams("sort=betrag-asc")).sort).toBe(
      "betrag-asc",
    );
    expect(parseBuchungslisteFilters(new URLSearchParams("sort=date-asc")).sort).toBe(
      "date-asc",
    );
  });

  it("falls back to date-desc on unknown sort", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams("sort=garbage")).sort).toBe(
      "date-desc",
    );
  });

  it("returns 'all' when sphere not provided", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams()).sphere).toBe("all");
  });

  it("accepts canonical sphere values", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams("sphere=zweckbetrieb")).sphere).toBe(
      "zweckbetrieb",
    );
  });

  it("rejects junk sphere → 'all'", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams("sphere=garbage")).sphere).toBe(
      "all",
    );
  });

  it("parses kind=donation", () => {
    expect(parseBuchungslisteFilters(new URLSearchParams("kind=donation")).kind).toBe(
      "donation",
    );
  });

  it("parses kategorie + project filter ids", () => {
    const f = parseBuchungslisteFilters(
      new URLSearchParams("kategorie=k1&project=p1"),
    );
    expect(f.kategorieId).toBe("k1");
    expect(f.projectId).toBe("p1");
  });
});

describe("filterAndSortRows", () => {
  const rows: BuchungslisteRow[] = [
    makeRow({ id: "1", sphereSnapshot: "ideeller", betragCents: 5000, gebuchtAm: "2025-03-10" }),
    makeRow({
      id: "2",
      sphereSnapshot: "zweckbetrieb",
      betragCents: 20000,
      gebuchtAm: "2025-06-20",
      kind: "income",
      kategorieId: "k2",
      projectId: "p1",
    }),
    makeRow({
      id: "3",
      sphereSnapshot: "wirtschaftlich",
      betragCents: 8000,
      gebuchtAm: "2025-08-01",
      kind: "donation",
    }),
  ];

  it("filters by sphere", () => {
    const out = filterAndSortRows(rows, {
      sphere: "ideeller",
      kind: "all",
      sort: "date-desc",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("1");
  });

  it("filters by kind", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "donation",
      sort: "date-desc",
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("donation");
  });

  it("filters by kategorieId strictly", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      kategorieId: "k2",
      sort: "date-desc",
    });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("filters by projectId strictly", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      projectId: "p1",
      sort: "date-desc",
    });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });

  it("sorts date-desc (newest first)", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      sort: "date-desc",
    });
    expect(out.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("sorts date-asc (oldest first)", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      sort: "date-asc",
    });
    expect(out.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts betrag-desc (largest first)", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      sort: "betrag-desc",
    });
    expect(out.map((r) => r.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts betrag-asc (smallest first)", () => {
    const out = filterAndSortRows(rows, {
      sphere: "all",
      kind: "all",
      sort: "betrag-asc",
    });
    expect(out.map((r) => r.id)).toEqual(["1", "3", "2"]);
  });

  it("filters compose: sphere + kind + sort", () => {
    const out = filterAndSortRows(rows, {
      sphere: "zweckbetrieb",
      kind: "income",
      sort: "betrag-desc",
    });
    expect(out.map((r) => r.id)).toEqual(["2"]);
  });
});
