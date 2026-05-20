/**
 * @vitest-environment node
 * @phase-2
 *
 * C1 cycle 3 — NEW-1 — the downloadable EÜR PDF code path must use the
 * same 3-source union (income + donations + member_beitrags) as the
 * workspace UI.
 *
 * Before this fix the PDF endpoint computed `eur` only from income +
 * expenses, so a Verein whose ideelle Einnahmen are dominated by
 * Mitgliedsbeiträge + Spenden (the typical case) saw a PDF with a fraction
 * of the true Einnahmen.
 *
 * Test contract: `loadEurAggregatesForPdf(year)` MUST return an
 * EurYearResult whose totalEinnahmenCents matches the workspace's
 * eur.totalEinnahmenCents for the same year — both compute the union.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "C1 cycle 3 — EÜR PDF code path uses 3-source union (NEW-1)",
  () => {
    let sql: ReturnType<typeof postgres>;
    const YEAR = 2031;
    const DON_BID = `S-${YEAR}-310101`;
    let memberId = "";

    beforeAll(async () => {
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      // NO income row this year — only a donation + a paid Mitgliedsbeitrag.
      // The PDF must still report these on the Einnahmen side.
      await sql`
        INSERT INTO donations (
          business_id, gebucht_am, betrag_cents, spender_name,
          kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind
        ) VALUES (
          ${DON_BID},
          ${`${YEAR}-04-10 10:00:00+01`},
          50000,
          'c1-cycle3 spender',
          'Geldspende',
          'ideeller',
          'geldspende',
          'zweckfrei'
        )
      `;

      const [m] = await sql<{ id: string }[]>`SELECT id FROM members LIMIT 1`;
      if (!m) throw new Error("c1-cycle3: needs at least one fixture member");
      memberId = m.id;
      await sql`
        INSERT INTO member_beitrags (
          member_id, year, betrag_cents, paid_cents, gezahlt_am
        ) VALUES (
          ${memberId}, ${YEAR}, 6969, 6969, ${`${YEAR}-05-15`}
        )
        ON CONFLICT (member_id, year) DO UPDATE
          SET betrag_cents = EXCLUDED.betrag_cents,
              paid_cents = EXCLUDED.paid_cents,
              gezahlt_am = EXCLUDED.gezahlt_am
      `;
    }, 30_000);

    afterAll(async () => {
      await sql`DELETE FROM donations WHERE business_id = ${DON_BID}`;
      await sql`DELETE FROM member_beitrags WHERE member_id = ${memberId} AND year = ${YEAR}`;
      await sql.end();
    });

    it("loadEurAggregatesForPdf(YEAR).eur matches workspace einnahmen totals (union)", async () => {
      const { loadEurAggregatesForPdf, loadEurWorkspaceData } =
        await import("$lib/server/eur/load.js");
      const pdfData = await loadEurAggregatesForPdf(YEAR);
      const workspace = await loadEurWorkspaceData(YEAR);

      // Without union: PDF totalEinnahmen would be 0 (no income rows).
      // With union: both must report 50000 + 6969 = 56969 in ideeller.
      expect(Number(pdfData.eur.totalEinnahmenCents)).toBeGreaterThanOrEqual(
        56969,
      );
      expect(workspace.eur.totalEinnahmenCents).toBeGreaterThanOrEqual(56969);
      // The two must AGREE — the PDF and the workspace must show the same
      // Einnahmen total. This is the core invariant.
      expect(Number(pdfData.eur.totalEinnahmenCents)).toBe(
        workspace.eur.totalEinnahmenCents,
      );
      expect(Number(pdfData.eur.bySphere.ideeller.totals.einnahmenCents)).toBe(
        workspace.eur.bySphere.ideeller.einnahmenCents,
      );
    });

    it("eur.pdf endpoint serves a PDF whose underlying eur uses the union", async () => {
      const mod =
        await import("../../src/routes/app/jahresabschluss/[year]/eur.pdf/+server.ts");
      const handler = mod.GET;
      const event = {
        params: { year: String(YEAR) },
      } as unknown as Parameters<typeof handler>[0];
      const res = await handler(event);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      const buf = await res.arrayBuffer();
      // %PDF magic bytes — content is binary; the deeper assertion is the
      // shared-function contract above. A non-empty PDF here verifies the
      // endpoint successfully consumes the unioned data without crashing.
      expect(buf.byteLength).toBeGreaterThan(200);
      const head = new Uint8Array(buf.slice(0, 4));
      expect(Array.from(head)).toEqual([0x25, 0x50, 0x44, 0x46]);
    });
  },
);
