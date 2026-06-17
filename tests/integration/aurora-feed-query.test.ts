/**
 * @vitest-environment node
 *
 * Aurora slice 5 — listTransaktionenFeedPage (SQL UNION-ALL unified feed).
 *
 * DB-backed (per-fork clone of the seeded template DB). Seeds one row of each
 * kind in an isolated far-future year (2097) where all three share the SAME
 * gebucht_am but carry different CASH dates — so cross-type ordering provably
 * follows the cash (relevanz) date, not gebucht_am. Skipped when
 * DIRECT_DATABASE_URL is unset.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { listTransaktionenFeedPage } from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;
const YEAR = 2097;

function feedState(query = "") {
  return parseFilterState("transaktionen", new URLSearchParams(query));
}

describe.skipIf(!dbConfigured)("listTransaktionenFeedPage", () => {
  beforeAll(async () => {
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      const [expKat] = await client<{ id: string }[]>`
        SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      const [incKat] = await client<{ id: string }[]>`
        SELECT id FROM kategorien WHERE kind = 'income' AND name NOT LIKE 'Geldspende%' AND name <> 'Sachspende' LIMIT 1`;
      const [donKat] = await client<{ id: string }[]>`
        SELECT id FROM kategorien WHERE name = 'Geldspende zweckfrei' LIMIT 1`;
      if (!expKat || !incKat || !donKat) {
        throw new Error("feed seed: reference kategorien missing");
      }
      // gebucht_am IDENTICAL on all three; only the cash dates differ.
      // Expected feed order: donation (06-01) → income (05-20) → expense (05-10).
      await client`
        INSERT INTO expenses (
          business_id, bezeichnung, betrag_cents, currency, sphere_snapshot,
          kategorie_id, kategorie_name_snapshot, status, bezahlt_von_kind,
          bezahlt_von_display, beleg_verzicht_grund, abfluss_datum, gebucht_am
        ) VALUES (
          'A-2097-990001', 'Feed Pivot Ausgabe', 1100, 'EUR', 'ideeller',
          ${expKat.id}, 'Test-Kategorie', 'geprueft', 'verein',
          'Verein', 'feed seed', '2097-05-10', '2097-07-01T10:00:00+02'
        ) ON CONFLICT DO NOTHING`;
      await client`
        INSERT INTO income (
          business_id, bezeichnung, betrag_cents, currency, sphere_snapshot,
          kategorie_id, kategorie_name_snapshot, geld_eingang_datum, gebucht_am
        ) VALUES (
          'E-2097-990001', 'Feed Pivot Einnahme', 2200, 'EUR', 'ideeller',
          ${incKat.id}, 'Test-Kategorie', '2097-05-20', '2097-07-01T10:00:00+02'
        ) ON CONFLICT DO NOTHING`;
      await client`
        INSERT INTO donations (
          business_id, betrag_cents, currency, sphere_snapshot, kategorie_id,
          kategorie_name_snapshot, spende_kind, zweckbindung_kind, spender_name,
          zugewendet_am, gebucht_am
        ) VALUES (
          'S-2097-990001', 3300, 'EUR', 'ideeller', ${donKat.id},
          'Geldspende zweckfrei', 'geldspende', 'zweckfrei', 'Feed Pivot Spenderin',
          '2097-06-01', '2097-07-01T10:00:00+02'
        ) ON CONFLICT DO NOTHING`;
    } finally {
      await client.end();
    }
  });

  it("orders cross-type by the CASH date desc (not gebucht_am) and projects all three kinds", async () => {
    const { rows, total } = await listTransaktionenFeedPage({
      state: feedState(),
      year: YEAR,
      limit: 50,
      offset: 0,
    });
    expect(total).toBe(3);
    expect(rows.map((r) => r.businessId)).toEqual([
      "S-2097-990001",
      "E-2097-990001",
      "A-2097-990001",
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["donation", "income", "expense"]);
    expect(rows.map((r) => r.relevanzDatum)).toEqual([
      "2097-06-01",
      "2097-05-20",
      "2097-05-10",
    ]);
  });

  it("projects per-kind display fields (derived donation label, expense status, ink-signing inputs)", async () => {
    const { rows } = await listTransaktionenFeedPage({
      state: feedState(),
      year: YEAR,
      limit: 50,
      offset: 0,
    });
    const don = rows.find((r) => r.kind === "donation")!;
    const exp = rows.find((r) => r.kind === "expense")!;
    const inc = rows.find((r) => r.kind === "income")!;
    expect(don.bezeichnung).toBe("Spende von Feed Pivot Spenderin");
    expect(don.status).toBeNull();
    expect(don.betragCents).toBe(3300);
    expect(exp.status).toBe("geprueft");
    // beleg_verzicht_grund is set → NOT "Beleg fehlt" (0032 invariant).
    expect(exp.belegFehlt).toBe(false);
    expect(inc.bezeichnung).toBe("Feed Pivot Einnahme");
    expect(inc.sphereEffective).toBe("ideeller");
    expect(typeof inc.gebuchtAm).toBe("string");
  });

  it("LIMIT/OFFSET pages the union window while total stays constant (page-clamp contract)", async () => {
    const page0 = await listTransaktionenFeedPage({
      state: feedState(),
      year: YEAR,
      limit: 2,
      offset: 0,
    });
    const page1 = await listTransaktionenFeedPage({
      state: feedState(),
      year: YEAR,
      limit: 2,
      offset: 2,
    });
    expect(page0.total).toBe(3);
    expect(page1.total).toBe(3);
    expect(page0.rows.map((r) => r.businessId)).toEqual([
      "S-2097-990001",
      "E-2097-990001",
    ]);
    expect(page1.rows.map((r) => r.businessId)).toEqual(["A-2097-990001"]);
  });

  it("?typ= prunes UNION arms: spenden-only and ausgaben+einnahmen", async () => {
    const spenden = await listTransaktionenFeedPage({
      state: feedState("typ=spenden"),
      year: YEAR,
      limit: 50,
      offset: 0,
    });
    expect(spenden.total).toBe(1);
    expect(spenden.rows[0]!.kind).toBe("donation");

    const noSpenden = await listTransaktionenFeedPage({
      state: feedState("typ=ausgaben,einnahmen"),
      year: YEAR,
      limit: 50,
      offset: 0,
    });
    expect(noSpenden.total).toBe(2);
    expect(noSpenden.rows.every((r) => r.kind !== "donation")).toBe(true);
  });

  it("?q= applies the per-type search predicates", async () => {
    const { rows, total } = await listTransaktionenFeedPage({
      state: feedState("q=Pivot Ausgabe"),
      year: YEAR,
      limit: 50,
      offset: 0,
    });
    expect(total).toBe(1);
    expect(rows[0]!.businessId).toBe("A-2097-990001");
  });

  it('limit: "all" returns the full year-scoped set (export/Buchungsliste lane)', async () => {
    const { rows, total } = await listTransaktionenFeedPage({
      state: feedState(),
      year: YEAR,
      limit: "all",
      offset: 0,
    });
    expect(total).toBe(3);
    expect(rows.length).toBe(3);
  });
});
