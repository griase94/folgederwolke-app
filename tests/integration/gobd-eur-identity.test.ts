// @vitest-environment node
/**
 * S1 — the GoBD/EÜR sum identity.
 *
 * A Jahresabschluss bundle ships two documents a Betriebsprüfer reconciles
 * against each other: `01_EÜR-{year}.pdf` (rendered from the 3-source union
 * income + donations + member_beitrags) and the GoBD-Z3 journal
 * `05_GoBD-Z3-{year}/gobd_z3_{year}.xml`. Before S1 the journal had arms for
 * income and Spenden but none for Mitgliedsbeiträge, so the two disagreed by
 * the entire Beitragssumme — for a Verein whose largest income block is
 * Beiträge, that is the first number anyone checks.
 *
 * The contract pinned here is deliberately asserted on the EMITTED XML, not on
 * the inputs: sum of every positive <BetragEUR> in the journal === the EÜR's
 * totalEinnahmenCents. Any future arm added to one side and forgotten on the
 * other fails here.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import JSZip from "jszip";
import { getDb } from "$lib/server/db/index.js";
import { computeEurYear } from "$lib/server/domain/eur.js";
import { loadEurAggregatesForPdf } from "$lib/server/eur/load.js";
import { buildJahresabschlussBundle } from "$lib/server/export/bundle.js";
import { generateGobdZ3Xml } from "$lib/server/export/gobd-z3.js";
import type { SpendenlisteRow } from "$lib/server/export/spendenliste-csv.js";

const YEAR = 2026;

/**
 * Sum the Einnahme-side records of a GoBD journal, in cents.
 *
 * Ausgaben are emitted with a leading `-`, so "positive amount" is exactly the
 * Einnahmen side (Art = Einnahme | Spende | Mitgliedsbeitrag) without having to
 * parse <Art>.
 */
function sumEinnahmenCentsFromXml(xml: string): number {
  return [...xml.matchAll(/<BetragEUR>([^<]*)<\/BetragEUR>/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0)
    .reduce((a, b) => a + Math.round(b * 100), 0);
}

/** The bundle route's Spendenliste query, verbatim in its money-relevant part. */
async function loadSpendenForBundle(year: number): Promise<SpendenlisteRow[]> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT d.business_id,
           COALESCE(d.zugewendet_am::text,
                    (d.gebucht_am AT TIME ZONE 'Europe/Berlin')::date::text) AS relevanz_datum,
           d.betrag_cents, d.spender_name, d.kategorie_name_snapshot,
           d.sphere_snapshot
      FROM donations d
     WHERE d.year_of_buchung = ${year}
       AND d.supersedes_id IS NULL
  `)) as unknown as Array<{
    business_id: string;
    relevanz_datum: string;
    betrag_cents: bigint;
    spender_name: string | null;
    kategorie_name_snapshot: string;
    sphere_snapshot: string;
  }>;
  return rows.map((r) => ({
    businessId: r.business_id,
    zugewendetAm: null,
    relevanzDatum: r.relevanz_datum,
    betragCents: BigInt(r.betrag_cents),
    spendeKind: "geldspende",
    zweckbindungKind: "zweckfrei",
    zweckbindungText: null,
    spenderName: r.spender_name,
    spenderAdresse: null,
    spenderEmail: null,
    memberName: null,
    bescheinigungNr: null,
    bescheinigungAusgestelltAm: null,
    kategorieName: r.kategorie_name_snapshot,
    sphereSnapshot: r.sphere_snapshot,
  }));
}

async function buildJournal(year: number) {
  const agg = await loadEurAggregatesForPdf(year);
  const spenden = await loadSpendenForBundle(year);
  const xml = generateGobdZ3Xml({
    year,
    vereinName: agg.vereinName,
    vereinSteuernummer: "143/215/10028",
    exportedAt: new Date("2026-08-04T12:00:00Z"),
    einnahmen: agg.einnahmenRowsWithKategorien,
    ausgaben: agg.ausgabenRowsWithKategorien,
    spenden,
    beitrags: agg.beitragEurRows,
  });
  return { agg, xml };
}

describe("GoBD-Z3 journal vs EÜR — Einnahmen sum identity", () => {
  beforeAll(async () => {
    // Guarantee the year under test actually HAS a paid Beitrag, otherwise the
    // identity would hold vacuously and the regression this pins (a missing
    // Beitrags-arm) would pass unnoticed.
    const db = getDb();
    const [open] = (await db.execute(sql`
      SELECT mb.member_id::text AS mid
        FROM member_beitrags mb
       WHERE mb.year = ${YEAR} AND mb.gezahlt_am IS NULL
       LIMIT 1
    `)) as unknown as Array<{ mid: string }>;
    if (open) {
      await db.execute(sql`
        UPDATE member_beitrags
           SET paid_cents = betrag_cents, gezahlt_am = ${`${YEAR}-03-15`}
         WHERE member_id = ${open.mid}::uuid AND year = ${YEAR}
      `);
    }
  });

  it("emits at least one Mitgliedsbeitrag record", async () => {
    const { agg, xml } = await buildJournal(YEAR);
    expect(agg.beitragEurRows.length).toBeGreaterThan(0);
    expect(xml).toContain("<Art>Mitgliedsbeitrag</Art>");
  });

  it("journal Einnahmen sum === EÜR totalEinnahmenCents", async () => {
    const { agg, xml } = await buildJournal(YEAR);
    expect(sumEinnahmenCentsFromXml(xml)).toBe(
      Number(agg.eur.totalEinnahmenCents),
    );
  });

  it("dropping the Beitrags-arm breaks the identity (the S1 regression)", async () => {
    const agg = await loadEurAggregatesForPdf(YEAR);
    const spenden = await loadSpendenForBundle(YEAR);
    const withoutBeitrags = generateGobdZ3Xml({
      year: YEAR,
      vereinName: agg.vereinName,
      vereinSteuernummer: undefined,
      exportedAt: new Date("2026-08-04T12:00:00Z"),
      einnahmen: agg.einnahmenRowsWithKategorien,
      ausgaben: agg.ausgabenRowsWithKategorien,
      spenden,
      beitrags: [],
    });
    const shortfall =
      Number(agg.eur.totalEinnahmenCents) -
      sumEinnahmenCentsFromXml(withoutBeitrags);
    const beitragSum = agg.beitragEurRows.reduce(
      (a, r) => a + Number(r.betragCents),
      0,
    );
    expect(shortfall).toBe(beitragSum);
    expect(shortfall).toBeGreaterThan(0);
  });

  it("the assembled ZIP's GoBD XML carries the Beiträge (BundleInput wiring)", async () => {
    const agg = await loadEurAggregatesForPdf(YEAR);
    const spenden = await loadSpendenForBundle(YEAR);
    const zipBuffer = await buildJahresabschlussBundle({
      year: YEAR,
      eur: computeEurYear(
        YEAR,
        agg.einnahmenRowsWithKategorien,
        agg.ausgabenRowsWithKategorien,
      ),
      eurPdfBytes: null,
      spenden,
      belege: [],
      vereinName: agg.vereinName,
      includeGobdZ3: true,
      beitragEurRows: agg.beitragEurRows,
    });
    const zip = await JSZip.loadAsync(zipBuffer);
    const xml = await zip
      .file(`05_GoBD-Z3-${YEAR}/gobd_z3_${YEAR}.xml`)!
      .async("string");
    expect(xml).toContain("<Art>Mitgliedsbeitrag</Art>");
    expect(sumEinnahmenCentsFromXml(xml)).toBe(
      Number(agg.eur.totalEinnahmenCents),
    );
  });

  it("every Mitgliedsbeitrag record carries an in-window Datum and a readable BelegNr", async () => {
    const { xml } = await buildJournal(YEAR);
    const records = [...xml.matchAll(/<Record>[\s\S]*?<\/Record>/g)]
      .map((m) => m[0])
      .filter((r) => r.includes("<Art>Mitgliedsbeitrag</Art>"));
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      const datum = /<Datum>([^<]*)<\/Datum>/.exec(rec)?.[1] ?? "";
      expect(datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const belegNr = /<BelegNr>([^<]*)<\/BelegNr>/.exec(rec)?.[1] ?? "";
      expect(belegNr).toMatch(/^MB-\d{4}-[0-9a-f]{8}$/);
      expect(rec).toContain("<Sphare>ideeller</Sphare>");
    }
  });

  it("the export screen's Paket-Inhalt counter mirrors the journal's Arten", async () => {
    // §4.5 Manifest-Lüge, one level above the filename it already guards: the
    // screen promises what the ZIP holds, so a counter naming only
    // Einnahmen/Ausgaben/Spenden describes a package that has carried
    // Mitgliedsbeitrag records since S1. Pins the counter's query against the
    // journal it advertises — if one grows an Art, the other has to follow.
    const { agg, xml } = await buildJournal(YEAR);
    const journalBeitraege = [...xml.matchAll(/<Art>Mitgliedsbeitrag<\/Art>/g)]
      .length;
    expect(journalBeitraege).toBeGreaterThan(0);
    expect(journalBeitraege).toBe(agg.beitragEurRows.length);

    // The screen's own counting query, verbatim in its money-relevant part.
    const [row] = (await getDb().execute(sql`
      SELECT count(*)::int AS n FROM member_beitrags
       WHERE EXTRACT(YEAR FROM gezahlt_am)::int = ${YEAR}
         AND gezahlt_am IS NOT NULL AND paid_cents > 0
    `)) as unknown as Array<{ n: number }>;
    expect(row!.n).toBe(journalBeitraege);
  });
});
