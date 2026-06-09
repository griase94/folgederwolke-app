/**
 * @vitest-environment node
 *
 * Deliverable B3 — export + monthly `<Datum>` alignment to the cash date.
 *
 * After migration 0034, rows are SELECTed into a fiscal year by
 * `year_of_buchung` = the CASH-flow year (abfluss/geld_eingang/zugewendet).
 * The emitted/sorted `<Datum>` (and the monthly bucket) MUST therefore be the
 * cash date too — otherwise a record selected into year Y can carry a Datum
 * outside [Y-01-01, Y-12-31] (GoBD fiscal-window violation) or land in the
 * wrong month of the trendline.
 *
 * The canonical pivot case: a row with cash-date 2025-12 + gebucht_am 2026-01.
 * It is selected into fiscal year 2025 (cash-year), so:
 *   - GoBD-Z3 + transactions CSV must emit Datum = 2025-12-…
 *   - the 2025 monthly trendline must place it in month 12 (not month 1).
 *
 * RESET lane (node env):
 *   set -a && source .env.test && set +a && \
 *     pnpm test --run tests/integration/export-cash-date-alignment.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { generateGobdZ3Xml } from "$lib/server/export/gobd-z3.js";
import { buildTransactionsCsv } from "$lib/server/export/transactions-csv.js";
import {
  loadEurAggregatesForPdf,
  loadEurWorkspaceData,
} from "$lib/server/eur/load.js";
import { listTransactions } from "$lib/server/domain/transactions.js";
import type { EurRow } from "$lib/server/domain/eur.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// The pivot: cash year in December, gebucht_am the following January. The row
// books into the cash fiscal year (year_of_buchung from the cash date) — the
// Datum + month must follow the cash date. An isolated far-future cash year
// (never used by the corpus) keeps the monthly-trendline assertion exact.
const CASH_YEAR = 2095;
const CASH_DATE = `${CASH_YEAR}-12-20`;
const GEBUCHT = `${CASH_YEAR + 1}-01-08 10:00:00+01`; // a month AFTER the cash date

// ---------------------------------------------------------------------------
// Pure unit: GoBD-Z3 + transactions CSV emit the cash date (relevanzDatum)
// ---------------------------------------------------------------------------

describe("B3 — GoBD-Z3 + CSV emit the cash (relevanz) date", () => {
  it("GoBD-Z3 income+expense Datum is the cash date, not gebucht_am", () => {
    const mkRow = (over: Partial<EurRow>): EurRow => ({
      businessId: `E-${CASH_YEAR}-001`,
      gebuchtAm: new Date(GEBUCHT),
      // relevanzDatum is the cash date (geld_eingang/abfluss). It places the
      // row in the cash fiscal year and must be the emitted Datum.
      relevanzDatum: CASH_DATE,
      betragCents: 1000n,
      sphereSnapshot: "ideeller",
      kategorieId: null,
      kategorieNameSnapshot: "Test",
      eurZeile: null,
      anlageGemZeile: null,
      bezeichnung: "pivot row",
      belegDriveFileId: null,
      belegOriginalName: null,
      ...over,
    });

    const xml = generateGobdZ3Xml({
      year: CASH_YEAR,
      vereinName: "Test e.V.",
      vereinSteuernummer: undefined,
      exportedAt: new Date("2026-02-01T00:00:00Z"),
      einnahmen: [mkRow({ businessId: `E-${CASH_YEAR}-001` })],
      ausgaben: [mkRow({ businessId: `A-${CASH_YEAR}-001` })],
      spenden: [],
    });

    // Both records carry the cash date as <Datum>; the gebucht_am year must
    // never appear inside a <Datum> tag.
    const datums = [...xml.matchAll(/<Datum>([^<]*)<\/Datum>/g)].map(
      (m) => m[1],
    );
    expect(datums.length).toBe(2);
    for (const d of datums) {
      expect(d).toBe(CASH_DATE);
    }
    // Inside the declared fiscal window.
    expect(xml).toContain(`<DateFrom>${CASH_YEAR}-01-01</DateFrom>`);
    expect(xml).toContain(`<DateTo>${CASH_YEAR}-12-31</DateTo>`);
  });

  it("GoBD-Z3 Spende Datum falls back to the (Berlin) booking date when zugewendet_am is null", () => {
    // A donation selected into the year via its gebucht_am fallback
    // (year_of_buchung = year_for_booking(gebucht_am)) but with a NULL
    // zugewendet_am must still emit a non-empty, in-window <Datum>. The bundle
    // query threads relevanzDatum = COALESCE(zugewendet_am, Berlin gebucht_am).
    const xml = generateGobdZ3Xml({
      year: CASH_YEAR,
      vereinName: "Test e.V.",
      vereinSteuernummer: undefined,
      exportedAt: new Date("2026-02-01T00:00:00Z"),
      einnahmen: [],
      ausgaben: [],
      spenden: [
        {
          businessId: `S-${CASH_YEAR}-001`,
          zugewendetAm: null, // null cash date
          // The loader's COALESCE fallback = Berlin date of gebucht_am, in-window.
          relevanzDatum: `${CASH_YEAR}-07-15`,
          betragCents: 5000n,
          spendeKind: "geldspende",
          zweckbindungKind: "zweckfrei",
          zweckbindungText: null,
          spenderName: "Anon",
          spenderAdresse: null,
          spenderEmail: null,
          memberName: null,
          bescheinigungNr: null,
          bescheinigungAusgestelltAm: null,
          kategorieName: "Spenden",
          sphereSnapshot: "ideeller",
        },
      ],
    });
    const datums = [...xml.matchAll(/<Datum>([^<]*)<\/Datum>/g)].map(
      (m) => m[1],
    );
    expect(datums.length).toBe(1);
    expect(datums[0]).toBe(`${CASH_YEAR}-07-15`);
    // Must NOT be empty — an empty mandatory <Datum> garbles IDEA import.
    expect(datums[0]).not.toBe("");
    // Inside the declared fiscal window.
    expect(datums[0]! >= `${CASH_YEAR}-01-01`).toBe(true);
    expect(datums[0]! <= `${CASH_YEAR}-12-31`).toBe(true);
  });

  it("transactions CSV Datum column is the cash date for income+expense", () => {
    const csvExpense = buildTransactionsCsv(
      [
        {
          id: "x",
          kind: "expense",
          businessId: `A-${CASH_YEAR}-001`,
          bezeichnung: "pivot",
          betragCents: 1000,
          currency: "EUR",
          // gebuchtAm is the following-January timestamp; relevanzDatum is the cash date.
          gebuchtAm: new Date(GEBUCHT).toISOString(),
          relevanzDatum: CASH_DATE,
          sphereSnapshot: "ideeller",
          sphereOverride: null,
          sphereEffective: "ideeller",
          kategorieNameSnapshot: "Test",
          yearOfBuchung: CASH_YEAR,
          festgeschriebenAt: null,
          status: "geprueft",
          bezahltVonKind: "verein",
          bezahltVonDisplay: "Verein",
          erstattetAm: null,
          belegFileId: null,
          approvedAt: null,
        },
      ],
      "ausgaben",
    );
    const dataLine = csvExpense
      .split("\r\n")
      .filter((l) => l.includes(`A-${CASH_YEAR}-001`))[0]!;
    const datumCell = dataLine.split(";")[0]!;
    expect(datumCell).toContain(CASH_DATE);
    // The gebucht_am year must not leak into the Datum cell.
    expect(datumCell).not.toContain(String(CASH_YEAR + 1));
  });
});

// ---------------------------------------------------------------------------
// Integration: the real queries thread the cash date through.
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)(
  "B3 — cash date threaded through real queries",
  () => {
    let admin: ReturnType<typeof postgres>;
    let EXPENSE_KAT = "";
    let INCOME_KAT = "";

    // Null-cash boundary pivot: a gebucht_am at 2095-12-31 23:30 UTC is
    // 2096-01-01 00:30 in Berlin (CET = UTC+1). With NO cash date, the row's
    // year_of_buchung = year_for_booking(gebucht_am) = 2096 (Berlin). The OLD
    // JS fallback (toISOString().slice(0,10)) would emit 2095-12-31 — outside
    // the 2096 fiscal window. The fix emits the Berlin date 2096-01-01.
    const BOUNDARY_BERLIN_YEAR = 2096;
    const BOUNDARY_GEBUCHT_UTC = "2095-12-31 23:30:00+00";
    const BOUNDARY_BERLIN_DATE = "2096-01-01";

    async function seedNullCashBoundary(): Promise<void> {
      await admin`
      INSERT INTO expenses (
        business_id, source, gebucht_am, abfluss_datum, betrag_cents, currency,
        bezeichnung, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezahlt_von_kind, bezahlt_von_display, status, beleg_verzicht_grund
      ) VALUES (
        ${`A-${BOUNDARY_BERLIN_YEAR}-950001`}, 'app', ${BOUNDARY_GEBUCHT_UTC}, NULL, 4321, 'EUR',
        'boundary expense', ${EXPENSE_KAT}::uuid, 'Boundary', 'ideeller',
        'verein', 'Verein', 'geprueft', 'boundary fixture'
      )`;
      await admin`
      INSERT INTO income (
        business_id, source, gebucht_am, geld_eingang_datum, betrag_cents, currency,
        bezeichnung, kategorie_id, kategorie_name_snapshot, sphere_snapshot
      ) VALUES (
        ${`E-${BOUNDARY_BERLIN_YEAR}-950001`}, 'app', ${BOUNDARY_GEBUCHT_UTC}, NULL, 8765, 'EUR',
        'boundary income', ${INCOME_KAT}::uuid, 'Boundary', 'ideeller'
      )`;
    }

    async function seedExpense(): Promise<void> {
      await admin`
      INSERT INTO expenses (
        business_id, source, gebucht_am, abfluss_datum, betrag_cents, currency,
        bezeichnung, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezahlt_von_kind, bezahlt_von_display, status, beleg_verzicht_grund
      ) VALUES (
        ${`A-${CASH_YEAR}-940001`}, 'app', ${GEBUCHT}, ${CASH_DATE}::date, 1234, 'EUR',
        'pivot expense', ${EXPENSE_KAT}::uuid, 'Pivot', 'ideeller',
        'verein', 'Verein', 'geprueft', 'pivot fixture'
      )`;
    }

    async function seedIncome(): Promise<void> {
      await admin`
      INSERT INTO income (
        business_id, source, gebucht_am, geld_eingang_datum, betrag_cents, currency,
        bezeichnung, kategorie_id, kategorie_name_snapshot, sphere_snapshot
      ) VALUES (
        ${`E-${CASH_YEAR}-940001`}, 'app', ${GEBUCHT}, ${CASH_DATE}::date, 5678, 'EUR',
        'pivot income', ${INCOME_KAT}::uuid, 'Pivot', 'ideeller'
      )`;
    }

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      const [ke] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      const [ki] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'income' LIMIT 1`;
      if (!ke || !ki) throw new Error("missing seeded kategorien");
      EXPENSE_KAT = ke.id;
      INCOME_KAT = ki.id;
      await seedExpense();
      await seedIncome();
      await seedNullCashBoundary();
    });

    afterAll(async () => {
      await admin`DELETE FROM expenses WHERE business_id = ${`A-${CASH_YEAR}-940001`}`;
      await admin`DELETE FROM income WHERE business_id = ${`E-${CASH_YEAR}-940001`}`;
      await admin`DELETE FROM expenses WHERE business_id = ${`A-${BOUNDARY_BERLIN_YEAR}-950001`}`;
      await admin`DELETE FROM income WHERE business_id = ${`E-${BOUNDARY_BERLIN_YEAR}-950001`}`;
      await admin.end();
    });

    it("loadEurAggregatesForPdf threads relevanzDatum (cash) onto EurRow", async () => {
      const { einnahmenRowsWithKategorien, ausgabenRowsWithKategorien } =
        await loadEurAggregatesForPdf(CASH_YEAR);
      const inc = einnahmenRowsWithKategorien.find(
        (r) => r.businessId === `E-${CASH_YEAR}-940001`,
      );
      const exp = ausgabenRowsWithKategorien.find(
        (r) => r.businessId === `A-${CASH_YEAR}-940001`,
      );
      expect(inc).toBeDefined();
      expect(exp).toBeDefined();
      expect(inc!.relevanzDatum).toBe(CASH_DATE);
      expect(exp!.relevanzDatum).toBe(CASH_DATE);
    });

    it("GoBD-Z3 built from the real aggregates emits the cash date inside the 2025 window", async () => {
      const { einnahmenRowsWithKategorien, ausgabenRowsWithKategorien } =
        await loadEurAggregatesForPdf(CASH_YEAR);
      const xml = generateGobdZ3Xml({
        year: CASH_YEAR,
        vereinName: "Test e.V.",
        vereinSteuernummer: undefined,
        exportedAt: new Date("2026-02-01T00:00:00Z"),
        einnahmen: einnahmenRowsWithKategorien,
        ausgaben: ausgabenRowsWithKategorien,
        spenden: [],
      });
      // Locate our pivot records and assert their Datum == cash date.
      const incBlock = xml.slice(xml.indexOf(`E-${CASH_YEAR}-940001`));
      const expBlock = xml.slice(xml.indexOf(`A-${CASH_YEAR}-940001`));
      expect(incBlock).toMatch(new RegExp(`<Datum>${CASH_DATE}</Datum>`));
      expect(expBlock).toMatch(new RegExp(`<Datum>${CASH_DATE}</Datum>`));
    });

    it("listTransactions month filter buckets by the cash month, not gebucht_am month", async () => {
      // Pivot: cash 2095-12-20, gebucht 2096-01-08. Year filter = 2095 (cash
      // year). The month filter must align to the CASH month (12), NOT the
      // gebucht_am month (1) — else a month=12 drill-down would wrongly exclude
      // it and a month=1 drill-down would wrongly include it.
      const dec = await listTransactions({
        year: CASH_YEAR,
        month: 12,
        limit: 2000,
      });
      expect(
        dec.rows.some((r) => r.businessId === `E-${CASH_YEAR}-940001`),
      ).toBe(true);
      expect(
        dec.rows.some((r) => r.businessId === `A-${CASH_YEAR}-940001`),
      ).toBe(true);

      const jan = await listTransactions({
        year: CASH_YEAR,
        month: 1,
        limit: 2000,
      });
      expect(
        jan.rows.some((r) => r.businessId === `E-${CASH_YEAR}-940001`),
      ).toBe(false);
      expect(
        jan.rows.some((r) => r.businessId === `A-${CASH_YEAR}-940001`),
      ).toBe(false);
    });

    it("transactions CSV (via listTransactions) emits the cash date as Datum", async () => {
      const { rows } = await listTransactions({ year: CASH_YEAR, limit: 2000 });
      const inc = rows.find((r) => r.businessId === `E-${CASH_YEAR}-940001`);
      const exp = rows.find((r) => r.businessId === `A-${CASH_YEAR}-940001`);
      expect(inc).toBeDefined();
      expect(exp).toBeDefined();
      expect(inc!.relevanzDatum).toBe(CASH_DATE);
      expect(exp!.relevanzDatum).toBe(CASH_DATE);
    });

    it("null-cash row at the UTC/Berlin New-Year boundary keeps <Datum> inside the Berlin fiscal year", async () => {
      // The row books into 2096 (Berlin year of gebucht_am, cash null). Its
      // GoBD <Datum> + CSV Datum must be 2096-01-01 (Berlin), NOT 2095-12-31
      // (the UTC slice) — which would fall outside [2096-01-01, 2096-12-31].
      const { einnahmenRowsWithKategorien, ausgabenRowsWithKategorien } =
        await loadEurAggregatesForPdf(BOUNDARY_BERLIN_YEAR);
      const inc = einnahmenRowsWithKategorien.find(
        (r) => r.businessId === `E-${BOUNDARY_BERLIN_YEAR}-950001`,
      );
      const exp = ausgabenRowsWithKategorien.find(
        (r) => r.businessId === `A-${BOUNDARY_BERLIN_YEAR}-950001`,
      );
      expect(inc).toBeDefined();
      expect(exp).toBeDefined();
      // The threaded relevanzDatum is the Berlin date, never the UTC slice.
      expect(inc!.relevanzDatum).toBe(BOUNDARY_BERLIN_DATE);
      expect(exp!.relevanzDatum).toBe(BOUNDARY_BERLIN_DATE);

      const xml = generateGobdZ3Xml({
        year: BOUNDARY_BERLIN_YEAR,
        vereinName: "Test e.V.",
        vereinSteuernummer: undefined,
        exportedAt: new Date("2096-02-01T00:00:00Z"),
        einnahmen: einnahmenRowsWithKategorien,
        ausgaben: ausgabenRowsWithKategorien,
        spenden: [],
      });
      const incBlock = xml.slice(
        xml.indexOf(`E-${BOUNDARY_BERLIN_YEAR}-950001`),
      );
      const expBlock = xml.slice(
        xml.indexOf(`A-${BOUNDARY_BERLIN_YEAR}-950001`),
      );
      expect(incBlock).toMatch(
        new RegExp(`<Datum>${BOUNDARY_BERLIN_DATE}</Datum>`),
      );
      expect(expBlock).toMatch(
        new RegExp(`<Datum>${BOUNDARY_BERLIN_DATE}</Datum>`),
      );
      // The UTC-slice year/date must never appear in a <Datum>.
      const datums = [...xml.matchAll(/<Datum>([^<]*)<\/Datum>/g)].map(
        (m) => m[1]!,
      );
      for (const d of datums) {
        expect(d >= `${BOUNDARY_BERLIN_YEAR}-01-01`).toBe(true);
        expect(d <= `${BOUNDARY_BERLIN_YEAR}-12-31`).toBe(true);
      }

      // The transactions CSV path (listTransactions) must agree.
      const { rows } = await listTransactions({
        year: BOUNDARY_BERLIN_YEAR,
        limit: 2000,
      });
      const incRow = rows.find(
        (r) => r.businessId === `E-${BOUNDARY_BERLIN_YEAR}-950001`,
      );
      expect(incRow?.relevanzDatum).toBe(BOUNDARY_BERLIN_DATE);
    });

    it("EÜR monthly trendline buckets the pivot row in month 12 of 2025 (cash month)", async () => {
      const data = await loadEurWorkspaceData(CASH_YEAR);
      // monthlyOverschuss is a 12-element array (index 0 = January). The pivot
      // income (56,78€) − expense (12,34€) is realized in DECEMBER (cash month),
      // not January (the gebucht_am month). So month 12 (index 11) must be
      // non-zero, and month 1 (index 0) must be unaffected by our rows.
      expect(data.monthlyOverschuss.length).toBe(12);
      // Net of our two pivot rows = 5678 - 1234 = 4444 cents.
      expect(data.monthlyOverschuss[11]).toBe(4444);
      expect(data.monthlyOverschuss[0]).toBe(0);
    });
  },
);
