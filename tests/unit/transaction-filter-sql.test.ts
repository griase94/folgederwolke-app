// tests/unit/transaction-filter-sql.test.ts
//
// PURE fast-lane test (no DB connection): each builder returns SQL[] which we
// compose with and(...) and compile via `new PgDialect().sqlToQuery(...)` to a
// parameterized `{ sql, params }`. We assert on the bound params + rendered SQL
// fragments. This is reliable, unlike JSON.stringify on a SQL object.
import { describe, it, expect } from "vitest";
import { and } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildAusgabenWhere,
  buildEinnahmenWhere,
  buildSpendenWhere,
} from "$lib/server/domain/transaction-filter-sql.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const dialect = new PgDialect();

/** Compile a composed list of SQL conditions to `{ sql, params }` (no DB). */
function compile(conds: SQL[]) {
  return dialect.sqlToQuery(and(...conds)!);
}

describe("ausgaben WHERE builder", () => {
  it("maps status 'offen' to (zu_pruefen, in_pruefung) and includes geprueft", () => {
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=offen,geprueft"),
    );
    const conds = buildAusgabenWhere(state, 2026);
    const { params } = compile(conds);
    expect(params).toEqual(
      expect.arrayContaining(["zu_pruefen", "in_pruefung", "geprueft"]),
    );
  });

  it("adds a year predicate for a concrete year but not for ALL_YEARS", () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const withYear = buildAusgabenWhere(state, 2026);
    const allYears = buildAusgabenWhere(state, "all");
    const { params } = compile(withYear);
    expect(params).toContain(2026);
    // ALL_YEARS drops the only predicate => empty condition list.
    expect(allYears.length).toBe(0);
  });

  it("filters kategorie by name-snapshot strings (P2-04), bezahltVon, amount (BigInt) and belegFehlt", () => {
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams(
        "kategorie=Bürobedarf,Reisekosten&bezahltVon=verein,member&betragMin=1000&betragMax=5000&belegFehlt=true",
      ),
    );
    const conds = buildAusgabenWhere(state, 2026);
    const { sql, params } = compile(conds);
    // kategorie matches the name-snapshot column (NOT a kategorie id).
    expect(sql).toContain("kategorie_name_snapshot");
    expect(params).toEqual(
      expect.arrayContaining(["Bürobedarf", "Reisekosten", "verein", "member"]),
    );
    // betragCents bounds bind as BigInt (P2-05).
    expect(params).toContain(1000n);
    expect(params).toContain(5000n);
    // belegFehlt => beleg_file_id IS NULL AND beleg_verzicht_grund IS NULL.
    expect(sql).toContain("beleg_file_id");
    expect(sql).toContain("beleg_verzicht_grund");
    expect(sql).toContain("is null");
  });
});

describe("einnahmen WHERE builder", () => {
  it("filters kategorie by snapshot, sphaere, and adds the mitRechnung EXISTS", () => {
    const state = parseFilterState(
      "einnahmen",
      new URLSearchParams(
        "kategorie=Mitgliedsbeiträge&sphaere=ideeller,zweckbetrieb&mitRechnung=true",
      ),
    );
    const conds = buildEinnahmenWhere(state, 2026);
    const { sql, params } = compile(conds);
    expect(sql).toContain("kategorie_name_snapshot");
    expect(params).toEqual(
      expect.arrayContaining(["Mitgliedsbeiträge", "ideeller", "zweckbetrieb"]),
    );
    // mitRechnung => correlated EXISTS against invoices.paid_by_income_id.
    expect(sql.toLowerCase()).toContain("exists");
    expect(sql).toContain("paid_by_income_id");
  });

  it("monat builds an EXTRACT(MONTH ...) predicate", () => {
    const state = parseFilterState(
      "einnahmen",
      new URLSearchParams("monat=1,12"),
    );
    const conds = buildEinnahmenWhere(state, 2026);
    const { sql, params } = compile(conds);
    expect(sql.toUpperCase()).toContain("EXTRACT(MONTH FROM");
    expect(params).toEqual(expect.arrayContaining([1, 12]));
  });
});

describe("spenden WHERE builder", () => {
  it("filters spendenart, zweckbindung, spender member id, and search", () => {
    // Must be a valid UUIDv4 — parseFilterState validates member-picker ids via z.uuid().
    const memberId = "11111111-2222-4333-8444-555555555555";
    const state = parseFilterState(
      "spenden",
      new URLSearchParams(
        `spendenart=geldspende&zweckbindung=zweckgebunden&spender=${memberId}&q=Müller`,
      ),
    );
    const conds = buildSpendenWhere(state, 2026);
    const { sql, params } = compile(conds);
    expect(params).toEqual(
      expect.arrayContaining([
        "geldspende",
        "zweckgebunden",
        memberId,
        "%Müller%",
      ]),
    );
    // search hits both spender_name and kategorie_name_snapshot.
    expect(sql).toContain("spender_name");
  });

  it("bescheinigung 'ausstehend' alone => bescheinigung_nr IS NULL predicate", () => {
    const onlyYear = buildSpendenWhere(
      parseFilterState("spenden", new URLSearchParams("")),
      2026,
    );
    const ausstehend = buildSpendenWhere(
      parseFilterState(
        "spenden",
        new URLSearchParams("bescheinigung=ausstehend"),
      ),
      2026,
    );
    expect(ausstehend.length).toBe(onlyYear.length + 1);
    const { sql } = compile(ausstehend);
    expect(sql).toContain("bescheinigung_nr");
    expect(sql).toContain("is null");
  });

  it("bescheinigung 'versandt' alone => bescheinigung_nr IS NOT NULL predicate", () => {
    const versandt = buildSpendenWhere(
      parseFilterState(
        "spenden",
        new URLSearchParams("bescheinigung=versandt"),
      ),
      2026,
    );
    const { sql } = compile(versandt);
    expect(sql).toContain("bescheinigung_nr");
    expect(sql.toLowerCase()).toContain("is not null");
  });

  // X-PRAG-02: selecting BOTH bescheinigung states must add NO predicate (= show all).
  // Only single-state selection narrows the result; both-selected is a no-op filter.
  it("both 'versandt' + 'ausstehend' selected adds no bescheinigung predicate", () => {
    const onlyYear = buildSpendenWhere(
      parseFilterState("spenden", new URLSearchParams("")),
      2026,
    );
    const both = buildSpendenWhere(
      parseFilterState(
        "spenden",
        new URLSearchParams("bescheinigung=versandt,ausstehend"),
      ),
      2026,
    );
    // Same condition count as the no-filter baseline => no bescheinigung predicate added.
    expect(both.length).toBe(onlyYear.length);
  });
});
