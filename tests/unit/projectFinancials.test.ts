/**
 * @vitest-environment node
 * @phase-9 C1-PRJ-A
 *
 * Asserts `projectFinancials` + `batchProjectFinancials` produce the
 * expected einnahmen/ausgaben/saldo + offene-Rechnungen + auslagen-zu-prüfen
 * counts for a project, matching what the detail-page hero displays.
 *
 * Pattern mirrors `c1-eur-aggregation-roundtrip.test.ts`: insert deterministic
 * rows under a far-future fixture year so seed counts don't drift the test.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  projectFinancials,
  batchProjectFinancials,
} from "$lib/server/domain/projects.js";
import postgres from "postgres";

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DIRECT_DATABASE_URL.length > 0;

// Use a fixture year far from seed data so counts are deterministic.
// Year must round-trip through business_id format and year_of_buchung CHECKs.
const FY = 2099;
// 7-digit sequence so we don't collide with anything anyone else might seed.
const N1 = "9170001";
const N2 = "9170002";
const N3 = "9170003";

describe.skipIf(!dbConfigured)(
  "projectFinancials + batchProjectFinancials",
  () => {
    let sql: ReturnType<typeof postgres>;
    let p1: string;
    let p2: string;
    let p3: string;

    beforeAll(async () => {
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      const [r1] = await sql<
        { id: string }[]
      >`INSERT INTO projects (business_id, name) VALUES (${`P-${FY}-${N1}`}, 'PFIN Test 1') RETURNING id`;
      const [r2] = await sql<
        { id: string }[]
      >`INSERT INTO projects (business_id, name) VALUES (${`P-${FY}-${N2}`}, 'PFIN Test 2') RETURNING id`;
      const [r3] = await sql<
        { id: string }[]
      >`INSERT INTO projects (business_id, name) VALUES (${`P-${FY}-${N3}`}, 'PFIN Test 3') RETURNING id`;
      if (!r1 || !r2 || !r3) throw new Error("seed projects failed");
      p1 = r1.id;
      p2 = r2.id;
      p3 = r3.id;

      const [kI] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`;
      const [kE] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind='expense' LIMIT 1`;
      if (!kI || !kE) throw new Error("seed kategorien missing");

      // gebucht_am pinned in FY (Berlin local) so year_of_buchung lines up
      // with the business_id year-prefix CHECK.
      const FY_TS = `${FY}-04-05 10:00:00+01`;

      // p1 → einnahmen 1000c, ausgaben 250c (saldo +750c)
      await sql`INSERT INTO income (
      business_id, gebucht_am, betrag_cents, bezeichnung,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot, project_id
    ) VALUES (
      ${`E-${FY}-${N1}`}, ${FY_TS}, 1000, 'pfin inc 1',
      ${kI.id}, ${kI.name}, ${kI.sphere}::sphere, ${p1}::uuid
    )`;
      await sql`INSERT INTO expenses (
      business_id, gebucht_am, betrag_cents, bezeichnung,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot,
      bezahlt_von_kind, bezahlt_von_display, status, project_id
    ) VALUES (
      ${`A-${FY}-${N1}`}, ${FY_TS}, 250, 'pfin exp 1',
      ${kE.id}, ${kE.name}, ${kE.sphere}::sphere,
      'verein', 'Verein', 'zu_pruefen', ${p1}::uuid
    )`;

      // p1 → 1 offene Rechnung (bezahlt_am IS NULL)
      const [c1] = await sql<
        { id: string; name: string }[]
      >`SELECT id, name FROM customers LIMIT 1`;
      if (c1) {
        await sql`INSERT INTO invoices (
        business_id, gebucht_am, rechnungsdatum,
        customer_id, customer_name_snapshot,
        netto_cents, brutto_cents,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezeichnung, project_id
      ) VALUES (
        ${`FDW-${FY}-${N1}`}, ${FY_TS}, ${`${FY}-04-05`},
        ${c1.id}::uuid, ${c1.name},
        5000, 5000,
        ${kI.id}, ${kI.name}, ${kI.sphere}::sphere,
        'pfin invoice 1', ${p1}::uuid
      )`;
      }
    });

    afterAll(async () => {
      if (!sql) return;
      await sql`DELETE FROM income WHERE business_id LIKE ${`E-${FY}-91700%`}`;
      await sql`DELETE FROM expenses WHERE business_id LIKE ${`A-${FY}-91700%`}`;
      await sql`DELETE FROM invoices WHERE business_id LIKE ${`FDW-${FY}-91700%`}`;
      await sql`DELETE FROM projects WHERE business_id LIKE ${`P-${FY}-91700%`}`;
      await sql.end({ timeout: 5 });
    });

    it("singleton returns numeric einnahmen + ausgaben + saldo + counts", async () => {
      const r = await projectFinancials(p1);
      expect(typeof r.einnahmenCents).toBe("number");
      expect(typeof r.ausgabenCents).toBe("number");
      expect(r.einnahmenCents).toBe(1000);
      expect(r.ausgabenCents).toBe(250);
      expect(r.saldoCents).toBe(750);
      expect(r.offeneRechnungen).toBeGreaterThanOrEqual(1);
      expect(r.auslagenZuPruefen).toBeGreaterThanOrEqual(1);
    });

    it("batched returns map matching singleton call for the same id", async () => {
      const batch = await batchProjectFinancials([p1, p2, p3]);
      const s1 = await projectFinancials(p1);
      expect(batch[p1]).toEqual(s1);
      expect(batch[p2]).toEqual({
        einnahmenCents: 0,
        ausgabenCents: 0,
        saldoCents: 0,
        offeneRechnungen: 0,
        auslagenZuPruefen: 0,
      });
      expect(batch[p3]).toEqual({
        einnahmenCents: 0,
        ausgabenCents: 0,
        saldoCents: 0,
        offeneRechnungen: 0,
        auslagenZuPruefen: 0,
      });
    });

    it("returns the zero record for an unknown projectId (no row)", async () => {
      const r = await projectFinancials("00000000-0000-0000-0000-000000000099");
      expect(r).toEqual({
        einnahmenCents: 0,
        ausgabenCents: 0,
        saldoCents: 0,
        offeneRechnungen: 0,
        auslagenZuPruefen: 0,
      });
    });

    it("empty input → empty batch", async () => {
      const r = await batchProjectFinancials([]);
      expect(r).toEqual({});
    });
  },
);
