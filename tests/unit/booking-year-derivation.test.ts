/**
 * @vitest-environment node
 *
 * Deliverable B1 — booking-year canonicalization from the cash-flow date.
 *
 * Authoritative rule (post-panel):
 *   year_of_buchung := COALESCE(extract(year FROM <cash_date>)::int,
 *                               year_for_booking(gebucht_am))
 * for expenses(abfluss_datum) / income(geld_eingang_datum) /
 * donations(zugewendet_am). Invoices stay on year_for_booking(gebucht_am).
 *
 * `extract(year FROM date)` is IMMUTABLE so it can back a STORED generated
 * column — the `::timestamptz` form is only STABLE and a STORED generated
 * column REJECTS it. The "migration APPLIES" sentinel below catches that trap.
 *
 * RESET lane (node env), conventions from create-donation-derivation.test.ts:
 *   pnpm test --run tests/unit/booking-year-derivation.test.ts
 * — globalSetup resets + migrates + seeds before this file runs.
 *
 * Trigger enforcement / parity assertions connect as app_runtime (DATABASE_URL);
 * setup + teardown use the superuser (DIRECT_DATABASE_URL) which bypasses the
 * festschreibung triggers (session_user <> 'app_runtime').
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  createExpense,
  createIncome,
  createDonation,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { users } from "$lib/server/db/schema/users.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// The cash year we deliberately drive the generated column to. gebucht_am
// defaults to now() (2026 at time of writing); the cash date is a PRIOR year
// so a passing test proves the column derives from the cash date, not now().
const PRIOR_YEAR = 2025;
const PRIOR_CASH_DATE = `${PRIOR_YEAR}-12-28`;

describe.skipIf(!dbConfigured)(
  "booking-year derivation from cash-flow date",
  () => {
    let ACTOR = "";
    let EXPENSE_KAT = "";
    let INCOME_KAT = "";
    let admin: ReturnType<typeof postgres>;

    // Track ids created via direct insert (donations bescheinigung case) so we
    // can clean them up without relying on createdByUserId alone.
    const directDonationIds: string[] = [];

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      const [u] = await getDb()
        .insert(users)
        .values({
          email: "booking-year-derivation-test@example.com",
          emailCanonical: "booking-year-derivation-test@example.com",
          name: "Booking Year Derivation Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;

      // Resolve real seeded kategorie names (createExpense/createIncome resolve
      // by name, so pass a name that the seed installed).
      const [ke] = await admin<{ name: string }[]>`
      SELECT name FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      const [ki] = await admin<{ name: string }[]>`
      SELECT name FROM kategorien WHERE kind = 'income' LIMIT 1`;
      if (!ke || !ki)
        throw new Error("missing seeded expense/income kategorie");
      EXPENSE_KAT = ke.name;
      INCOME_KAT = ki.name;
    });

    afterAll(async () => {
      if (!ACTOR) {
        await admin.end();
        return;
      }
      const db = getDb();
      await db.delete(expenses).where(eq(expenses.createdByUserId, ACTOR));
      await db.delete(income).where(eq(income.createdByUserId, ACTOR));
      await db.delete(donations).where(eq(donations.createdByUserId, ACTOR));
      if (directDonationIds.length > 0) {
        await admin`DELETE FROM donations WHERE id IN ${admin(directDonationIds)}`;
      }
      await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}`;
      await db.delete(users).where(eq(users.id, ACTOR));
      await admin.end();
    });

    // --- migration-APPLIES sentinel ------------------------------------------
    // If migration 0034 used the STABLE `::timestamptz` form, the STORED
    // generated column would be rejected at apply-time and the whole reset would
    // fail (this file never runs). This assertion documents the invariant: the
    // generated-column expression is on disk and references extract(year FROM …).
    it("the year_of_buchung generated expression derives from the cash date (migration applied)", async () => {
      const rows = await admin<{ table_name: string; gen: string }[]>`
      SELECT c.relname AS table_name,
             pg_get_expr(d.adbin, d.adrelid) AS gen
        FROM pg_attribute a
        JOIN pg_class c       ON c.oid = a.attrelid
        JOIN pg_attrdef d     ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attname = 'year_of_buchung'
         AND a.attgenerated = 's'
         AND c.relname IN ('expenses', 'income', 'donations')
       ORDER BY c.relname`;
      const byTable = Object.fromEntries(
        rows.map((r) => [r.table_name, r.gen]),
      );
      expect(byTable["expenses"]).toMatch(/abfluss_datum/);
      expect(byTable["income"]).toMatch(/geld_eingang_datum/);
      expect(byTable["donations"]).toMatch(/zugewendet_am/);
      // and NOT the rejected ::timestamptz form
      for (const gen of Object.values(byTable)) {
        expect(gen).not.toMatch(/timestamptz/);
      }
    });

    // --- per-table prior-year cash → that year -------------------------------
    it("expense: prior-year abfluss_datum drives year_of_buchung (not now())", async () => {
      const businessId = await allocateBusinessId("A", PRIOR_YEAR);
      const { id } = await createExpense({
        bezeichnung: "prior-year abfluss",
        betragCents: 1000,
        abflussDatum: PRIOR_CASH_DATE,
        kategorieNameSnapshot: EXPENSE_KAT,
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        belegVerzichtGrund: "test fixture — kein Beleg",
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: expenses.yearOfBuchung })
        .from(expenses)
        .where(eq(expenses.id, id));
      expect(row?.y).toBe(PRIOR_YEAR);
    });

    it("income: prior-year geld_eingang_datum drives year_of_buchung (not now())", async () => {
      const businessId = await allocateBusinessId("E", PRIOR_YEAR);
      const { id } = await createIncome({
        bezeichnung: "prior-year eingang",
        betragCents: 2000,
        geldEingangDatum: PRIOR_CASH_DATE,
        kategorieNameSnapshot: INCOME_KAT,
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: income.yearOfBuchung })
        .from(income)
        .where(eq(income.id, id));
      expect(row?.y).toBe(PRIOR_YEAR);
    });

    it("donation: prior-year zugewendet_am drives year_of_buchung — cross-year no longer 23514s", async () => {
      // This is the latent bug: businessId S-2025, gebucht_am now() (2026). On
      // the OLD schema year_of_buchung=2026 ≠ 2025 → donations_business_id_year_ck
      // raises 23514. After 0034 the column derives from zugewendet_am → 2025.
      const businessId = await allocateBusinessId("S", PRIOR_YEAR);
      const { id } = await createDonation({
        betragCents: 5000,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckfrei",
        spenderName: "Cross-Year Spender",
        zugewendetAm: PRIOR_CASH_DATE,
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: donations.yearOfBuchung })
        .from(donations)
        .where(eq(donations.id, id));
      expect(row?.y).toBe(PRIOR_YEAR);
    });

    // --- NULL cash date → year_for_booking(gebucht_am) -----------------------
    it("expense: NULL abfluss_datum falls back to year_for_booking(gebucht_am)", async () => {
      const [yr] = await admin<{ y: number }[]>`
      SELECT year_for_booking(now()) AS y`;
      const expectedYear = yr!.y;
      const businessId = await allocateBusinessId("A", expectedYear);
      const { id } = await createExpense({
        bezeichnung: "null abfluss",
        betragCents: 1000,
        abflussDatum: null,
        kategorieNameSnapshot: EXPENSE_KAT,
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        belegVerzichtGrund: "test fixture — kein Beleg",
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: expenses.yearOfBuchung })
        .from(expenses)
        .where(eq(expenses.id, id));
      expect(row?.y).toBe(expectedYear);
    });

    it("income: NULL geld_eingang_datum falls back to year_for_booking(gebucht_am)", async () => {
      const [yr] = await admin<{ y: number }[]>`
      SELECT year_for_booking(now()) AS y`;
      const expectedYear = yr!.y;
      const businessId = await allocateBusinessId("E", expectedYear);
      const { id } = await createIncome({
        bezeichnung: "null eingang",
        betragCents: 2000,
        geldEingangDatum: null,
        kategorieNameSnapshot: INCOME_KAT,
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: income.yearOfBuchung })
        .from(income)
        .where(eq(income.id, id));
      expect(row?.y).toBe(expectedYear);
    });

    it("donation: NULL zugewendet_am falls back to year_for_booking(gebucht_am)", async () => {
      const [yr] = await admin<{ y: number }[]>`
      SELECT year_for_booking(now()) AS y`;
      const expectedYear = yr!.y;
      const businessId = await allocateBusinessId("S", expectedYear);
      const { id } = await createDonation({
        betragCents: 5000,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckfrei",
        spenderName: "Null Cash Spender",
        zugewendetAm: null,
        actorUserId: ACTOR,
        businessId,
      });
      const [row] = await getDb()
        .select({ y: donations.yearOfBuchung })
        .from(donations)
        .where(eq(donations.id, id));
      expect(row?.y).toBe(expectedYear);
    });

    // --- cross-year bescheinigung_nr donation OK -----------------------------
    // The cert number's year is the ISSUE year, not the EÜR cash year. After
    // dropping donations_bescheinigung_nr_year_ck, a B-2024 cert on a 2025
    // (zugewendet_am) donation must INSERT without 23514. Direct insert because
    // createDonation does not set bescheinigung_nr.
    it("donation: bescheinigung_nr year may differ from year_of_buchung (CHECK dropped)", async () => {
      const businessId = await allocateBusinessId("S", PRIOR_YEAR);
      const [katRow] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'income' LIMIT 1`;
      if (!katRow) throw new Error("missing seeded income kategorie");
      let err: unknown = null;
      let insertedId = "";
      try {
        const [r] = await admin<{ id: string }[]>`
        INSERT INTO donations (
          business_id, source, betrag_cents, currency, zugewendet_am,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind, spender_name,
          bescheinigung_nr, created_by_user_id
        ) VALUES (
          ${businessId}, 'app', 5000, 'EUR', ${PRIOR_CASH_DATE}::date,
          ${katRow.id}::uuid, 'Geldspende zweckfrei', 'ideeller',
          'geldspende', 'zweckfrei', 'Bescheinigung Cross-Year',
          ${`B-2024-${businessId.split("-")[2]}`}, ${ACTOR}::uuid
        ) RETURNING id`;
        insertedId = r?.id ?? "";
        if (insertedId) directDonationIds.push(insertedId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull();
      expect(insertedId).not.toBe("");
      // and the row's year_of_buchung came from zugewendet_am (2025), independent
      // of the bescheinigung_nr year (2024).
      const [row] = await admin<{ y: number }[]>`
      SELECT year_of_buchung AS y FROM donations WHERE id = ${insertedId}::uuid`;
      expect(row?.y).toBe(PRIOR_YEAR);
    });

    // --- trigger-parity canary -----------------------------------------------
    // After 0034 the festschreibung trigger (assert_not_festgeschrieben_fn) must
    // compute v_row_year inline from the SAME per-table cash expression as the
    // STORED column (the column is NULL inside a BEFORE trigger). If the trigger
    // still guards year_for_booking(gebucht_am) it protects the WRONG year.
    //
    // We prove parity behaviorally: lock the PRIOR cash year, then attempt an
    // INSERT (as app_runtime) of a row whose ONLY in-year signal is the cash
    // date (gebucht_am = now()/current year, which is ABOVE the lock). The
    // trigger must reject with 23514 — which it can only do if it reads the cash
    // date. A trigger still keyed on gebucht_am would let it through.
    it("festschreibung trigger guards the cash-derived year, per table (parity)", async () => {
      const app = postgres(DATABASE_URL, { prepare: false, max: 1 });
      const [kexp] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      const [kinc] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'income' LIMIT 1`;
      if (!kexp || !kinc) throw new Error("missing seeded kategorien");

      // Lock year Y; set the cash date in Y (at/below the lock) but gebucht_am
      // in Y+1 (ABOVE the lock). The business_id year segment matches the
      // gebucht_am year (Y+1) so the PRE-migration *_business_id_year_ck (which
      // couples business_id↔year_for_booking(gebucht_am)) is SATISFIED — that
      // way the only thing that can raise 23514 here is the festschreibung
      // trigger itself. Pre-migration the trigger reads gebucht_am=Y+1 > lock →
      // INSERT succeeds → this test FAILS (correct RED). Post-migration the
      // trigger reads the cash year Y ≤ lock → rejects (GREEN). Post-migration
      // the business_id_year_ck is dropped, so the Y+1 segment is harmless.
      const LOCKED = 2090;
      const GEB_YEAR = LOCKED + 1;
      const CASH = `${LOCKED}-06-15`;
      const GEBUCHT_ABOVE = `${GEB_YEAR}-06-15 10:00:00+02`;

      try {
        await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

        // expenses
        let expErr: unknown = null;
        try {
          await app`
          INSERT INTO expenses (
            business_id, source, gebucht_am, abfluss_datum, betrag_cents,
            currency, bezeichnung, kategorie_id, kategorie_name_snapshot,
            sphere_snapshot, bezahlt_von_kind, bezahlt_von_display, status,
            beleg_verzicht_grund
          ) VALUES (
            ${`A-${GEB_YEAR}-900`}, 'app', ${GEBUCHT_ABOVE}, ${CASH}::date, 1000,
            'EUR', 'parity expense', ${kexp.id}::uuid, '(Unkategorisiert)',
            'ideeller', 'verein', 'Verein', 'geprueft', 'parity fixture'
          )`;
        } catch (e) {
          expErr = e;
        }
        expect((expErr as { code?: string } | null)?.code).toBe("23514");

        // income
        let incErr: unknown = null;
        try {
          await app`
          INSERT INTO income (
            business_id, source, gebucht_am, geld_eingang_datum, betrag_cents,
            currency, bezeichnung, kategorie_id, kategorie_name_snapshot,
            sphere_snapshot
          ) VALUES (
            ${`E-${GEB_YEAR}-900`}, 'app', ${GEBUCHT_ABOVE}, ${CASH}::date, 1000,
            'EUR', 'parity income', ${kinc.id}::uuid, '(Unkategorisiert)',
            'ideeller'
          )`;
        } catch (e) {
          incErr = e;
        }
        expect((incErr as { code?: string } | null)?.code).toBe("23514");

        // donations
        let donErr: unknown = null;
        try {
          await app`
          INSERT INTO donations (
            business_id, source, gebucht_am, zugewendet_am, betrag_cents,
            currency, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
            spende_kind, zweckbindung_kind, spender_name
          ) VALUES (
            ${`S-${GEB_YEAR}-900`}, 'app', ${GEBUCHT_ABOVE}, ${CASH}::date, 1000,
            'EUR', ${kinc.id}::uuid, 'Geldspende zweckfrei', 'ideeller',
            'geldspende', 'zweckfrei', 'parity donation'
          )`;
        } catch (e) {
          donErr = e;
        }
        expect((donErr as { code?: string } | null)?.code).toBe("23514");
      } finally {
        await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
        await admin`DELETE FROM expenses WHERE business_id = ${`A-${GEB_YEAR}-900`}`;
        await admin`DELETE FROM income WHERE business_id = ${`E-${GEB_YEAR}-900`}`;
        await admin`DELETE FROM donations WHERE business_id = ${`S-${GEB_YEAR}-900`}`;
        await app.end();
      }
    });
  },
);
