/**
 * @vitest-environment node
 * @phase-2
 *
 * C1 cycle 2 — C1-H2 — loadEurWorkspaceData unions income + donations +
 * member_beitrags on the Einnahmen side.
 *
 * Round-trip: insert 1 income, 1 donation, 1 paid member-beitrag for the
 * same fiscal year + sphere; assert the workspace payload's ideeller
 * einnahmen totals all three.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";

const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "EÜR union: income + donations + member_beitrags (C1-H2)",
  () => {
    let sql: ReturnType<typeof postgres>;
    const YEAR = 2028;
    const INC_BID = `E-${YEAR}-720101`;
    const DON_BID = `S-${YEAR}-720102`;
    let memberId = "";

    beforeAll(async () => {
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      const [k] = await sql<
        { id: string; name: string }[]
      >`SELECT id, name FROM kategorien WHERE kind='income' AND sphere='ideeller' LIMIT 1`;
      if (!k) throw new Error("c1-union: missing ideeller income kategorie");

      // 1 income (10000 cents = 100 €)
      await sql`
        INSERT INTO income (
          business_id, gebucht_am, betrag_cents, bezeichnung,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot
        ) VALUES (
          ${INC_BID},
          ${`${YEAR}-03-15 10:00:00+01`},
          10000,
          'c1 union income',
          ${k.id},
          ${k.name},
          'ideeller'
        )
      `;
      // 1 donation (50000 cents = 500 €) — ideeller. Donations table has
      // no bezeichnung column; the EÜR composer synthesizes one from
      // spender_name / kategorie_name_snapshot.
      await sql`
        INSERT INTO donations (
          business_id, gebucht_am, betrag_cents, spender_name,
          kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind
        ) VALUES (
          ${DON_BID},
          ${`${YEAR}-04-15 10:00:00+01`},
          50000,
          'c1 union spender',
          'Geldspende',
          'ideeller',
          'geldspende',
          'zweckfrei'
        )
      `;
      // 1 paid member-beitrag (6969 cents = 69.69 €)
      // First find or create a member for this year.
      const [m] = await sql<{ id: string }[]>`SELECT id FROM members LIMIT 1`;
      if (!m) throw new Error("c1-union: needs at least one fixture member");
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
      await sql`DELETE FROM income WHERE business_id = ${INC_BID}`;
      await sql`DELETE FROM donations WHERE business_id = ${DON_BID}`;
      await sql`DELETE FROM member_beitrags WHERE member_id = ${memberId} AND year = ${YEAR}`;
      await sql.end();
    });

    it("ideeller einnahmen = income + donation + paid beitrag", async () => {
      const { loadEurWorkspaceData } = await import("$lib/server/eur/load.js");
      const out = await loadEurWorkspaceData(YEAR);
      // 10000 + 50000 + 6969 = 66969
      expect(out.eur.bySphere.ideeller.einnahmenCents).toBeGreaterThanOrEqual(
        66969,
      );
      expect(out.eur.totalEinnahmenCents).toBeGreaterThanOrEqual(66969);
    });

    it("monthly Überschuss buckets reflect donation + beitrag months", async () => {
      const { loadEurWorkspaceData } = await import("$lib/server/eur/load.js");
      const out = await loadEurWorkspaceData(YEAR);
      // March income: 10000 at index 2
      // April donation: 50000 at index 3
      // May beitrag: 6969 at index 4
      expect(out.monthlyOverschuss[2]).toBeGreaterThanOrEqual(10000);
      expect(out.monthlyOverschuss[3]).toBeGreaterThanOrEqual(50000);
      expect(out.monthlyOverschuss[4]).toBeGreaterThanOrEqual(6969);
    });
  },
);
