/**
 * @vitest-environment node
 *
 * Deliverable B2 — app-level Festschreibung gates align to the cash-derived
 * Buchungsjahr.
 *
 * After migration 0034, `year_of_buchung` derives from the cash-flow date:
 *   COALESCE(extract(year FROM <cash>)::int, year_for_booking(gebucht_am))
 * for expenses(abfluss_datum) / income(geld_eingang_datum) / donations(zugewendet_am).
 * The DB festschreibung trigger (assert_not_festgeschrieben_fn) already mirrors
 * this. The APP-layer gates must derive their guarded year from the SAME
 * COALESCE date, so the app rejection and the DB trigger agree (ADR-0006).
 *
 * These tests prove the gate fires at the APP layer (a structured ok:false
 * result), NOT merely as an uncaught DB 23514. The "valid one is allowed" cases
 * prove the gate is not over-broad.
 *
 * RESET lane (node env):
 *   set -a && source .env.test && set +a && \
 *     pnpm test --run tests/integration/festschreibung-cash-year-gate.test.ts
 *
 * Setup/teardown use the superuser (DIRECT_DATABASE_URL) which bypasses the
 * festschreibung triggers; the domain helpers connect as app_runtime.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { users } from "$lib/server/db/schema/users.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import {
  markExpenseErstattet,
  approveSubmission,
} from "$lib/server/domain/audit-inbox-actions.js";
import { markExpenseAsPaid } from "$lib/server/domain/transactions.js";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  seedFileViaAdmin,
} from "./_helpers/festschreibung-reset.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// A far-past closed year that the corpus never uses, so locking it can't
// freeze sibling reset-lane rows. gebucht_am stays in the current year (well
// ABOVE the lock) so ONLY the cash-derived year can place a row in the locked
// window — a gate keyed on gebucht_am would let it through (the RED state).
const LOCKED = 2015;
const CASH_IN_LOCKED = `${LOCKED}-12-20`;
// An open year safely above any plausible lock for the "allowed" cases.
const OPEN = 2099;
const CASH_IN_OPEN = `${OPEN}-03-10`;

describe.skipIf(!dbConfigured)(
  "B2 — Festschreibung gates derive year from the cash date",
  () => {
    let admin: ReturnType<typeof postgres>;
    let ACTOR = "";
    let EXPENSE_KAT_ID = "";
    let EXPENSE_KAT_NAME = "";
    let ZAHLART_ID = "";

    /** Lock everything up to and including `year` via superuser (bypasses triggers). */
    async function lockYear(year: number): Promise<void> {
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(year)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    }

    /**
     * Seed an approved (status='geprueft', approved_at set) expense via superuser
     * so the festschreibung trigger is bypassed at seed time. gebucht_am = now()
     * (current year), abfluss_datum optionally set.
     */
    async function seedApprovedExpense(opts: {
      bizSuffix: string;
      abflussDatum?: string | null;
    }): Promise<string> {
      const bizYear = new Date().getFullYear();
      const businessId = `A-${bizYear}-8${opts.bizSuffix}`;
      const [r] = await admin<{ id: string }[]>`
        INSERT INTO expenses (
          business_id, source, betrag_cents, currency, bezeichnung,
          abfluss_datum,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          bezahlt_von_kind, bezahlt_von_display, status, approved_at,
          approved_by_user_id, created_by_user_id, beleg_verzicht_grund
        ) VALUES (
          ${businessId}, 'app', 5000, 'EUR', 'gate fixture',
          ${opts.abflussDatum ?? null}::date,
          ${EXPENSE_KAT_ID}::uuid, ${EXPENSE_KAT_NAME}, 'ideeller',
          'verein', 'Verein', 'geprueft', NOW(),
          ${ACTOR}::uuid, ${ACTOR}::uuid, 'gate fixture — kein Beleg'
        ) RETURNING id`;
      if (!r) throw new Error("seed expense failed");
      return r.id;
    }

    /**
     * Seed a pending auslagen_submission (extern-paid) WITH an attached Beleg
     * file via superuser. The Beleg matters: approveSubmission copies
     * beleg_file_id onto the new expense, which must satisfy
     * expenses_beleg_or_grund_ck.
     */
    async function seedSubmission(opts: {
      bizSuffix: string;
      rechnungsdatum?: string | null;
    }): Promise<string> {
      const bizYear = new Date().getFullYear();
      const businessId = `AUS-${bizYear}-8${opts.bizSuffix}`;
      // Deterministic 00000000- prefix so cleanupFilesViaAdmin can scope it.
      const fileId = `00000000-0000-4000-8000-b2${opts.bizSuffix.padStart(10, "0")}`;
      // 64-char lowercase-hex sha256 (files_sha256_check). Derive from the
      // numeric bizSuffix so it's deterministic + unique per seed.
      const sha = `b2${opts.bizSuffix.replace(/\D/g, "")}`.padEnd(64, "0");
      await seedFileViaAdmin({
        id: fileId,
        storageKey: `beleg/b2-gate/${businessId}.pdf`,
        sha256: sha,
        kind: "beleg",
      });
      const [r] = await admin<{ id: string }[]>`
        INSERT INTO auslagen_submissions (
          business_id, bezeichnung, betrag_cents, currency,
          rechnungsdatum, bezahlt_von_kind, bezahlt_von_display,
          extern_name, extern_email, consent_text_version, beleg_file_id
        ) VALUES (
          ${businessId}, 'submission fixture', 5000, 'EUR',
          ${opts.rechnungsdatum ?? null}::date, 'extern', 'Extern Person',
          'Extern Person', 'gate-extern@example.com', 'v1', ${fileId}::uuid
        ) RETURNING id`;
      if (!r) throw new Error("seed submission failed");
      return r.id;
    }

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      const [u] = await getDb()
        .insert(users)
        .values({
          email: "b2-gate-test@example.com",
          emailCanonical: "b2-gate-test@example.com",
          name: "B2 Gate Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor");
      ACTOR = u.id;

      const [k] = await admin<{ id: string; name: string }[]>`
        SELECT id, name FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      if (!k) throw new Error("missing seeded expense kategorie");
      EXPENSE_KAT_ID = k.id;
      EXPENSE_KAT_NAME = k.name;

      const [z] = await admin<{ id: string }[]>`
        SELECT id FROM zahlungsarten WHERE deactivated = false LIMIT 1`;
      if (!z) throw new Error("missing seeded zahlungsart");
      ZAHLART_ID = z.id;
    });

    afterAll(async () => {
      // Unlock first so any current-year rows can be deleted (the trigger
      // blocks DELETE on app_runtime, but admin bypasses it — still, reset for
      // sibling test files).
      await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
      if (ACTOR) {
        // Submissions reference the approve-created expense via
        // approved_expense_id (ON DELETE has no cascade) — clear them first.
        await admin`DELETE FROM auslagen_submissions WHERE business_id LIKE ${"AUS-%-8%"}`;
        // DELETE the expenses outright (don't null beleg_file_id — an approve
        // row has no verzicht grund, so nulling its beleg would trip
        // expenses_beleg_or_grund_ck).
        await admin`DELETE FROM expenses WHERE created_by_user_id = ${ACTOR}::uuid`;
        await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}::uuid`;
        await admin`DELETE FROM users WHERE id = ${ACTOR}::uuid`;
      }
      // Remove the seeded Beleg files now that no row references them.
      await admin`DELETE FROM files WHERE id::text LIKE ${"00000000-0000-4000-8000-b2%"}`;
      await admin.end();
      await closeAdminConnection();
    });

    beforeEach(async () => {
      await resetFestgeschreibungBis();
    });

    // ── markExpenseErstattet ──────────────────────────────────────────────
    // The chosenDate (abfluss being written) lands the row in its year. A
    // chosenDate in a locked year must be rejected at the APP layer.

    it("markExpenseErstattet: rejects when chosenDate falls in a festgeschriebenes year", async () => {
      const id = await seedApprovedExpense({ bizSuffix: "00001" });
      await lockYear(LOCKED);

      const res = await markExpenseErstattet({
        expenseId: id,
        chosenDate: CASH_IN_LOCKED,
        zahlungsartId: ZAHLART_ID,
        actorUserId: ACTOR,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toMatch(
          new RegExp(`${LOCKED}.*festgeschrieben`, "i"),
        );
      }
      // The row must NOT have been written (no abfluss/erstattet stamped).
      const [row] = await getDb()
        .select({ erstattetAm: expenses.erstattetAm })
        .from(expenses)
        .where(eq(expenses.id, id));
      expect(row?.erstattetAm).toBeNull();
    });

    it("markExpenseErstattet: allows when chosenDate falls in an open year", async () => {
      const id = await seedApprovedExpense({ bizSuffix: "00002" });
      await lockYear(LOCKED);

      const res = await markExpenseErstattet({
        expenseId: id,
        chosenDate: CASH_IN_OPEN,
        zahlungsartId: ZAHLART_ID,
        actorUserId: ACTOR,
      });

      expect(res.ok).toBe(true);
    });

    // ── markExpenseAsPaid ─────────────────────────────────────────────────
    // Gate on year(COALESCE(existing abfluss_datum, datum)). When the row has
    // an existing abfluss in a locked year, marking paid must be rejected even
    // though the `datum` passed in is in an open year.

    it("markExpenseAsPaid: rejects when existing abfluss_datum is in a festgeschriebenes year", async () => {
      const id = await seedApprovedExpense({
        bizSuffix: "00003",
        abflussDatum: CASH_IN_LOCKED,
      });
      await lockYear(LOCKED);

      const res = await markExpenseAsPaid(id, {
        datum: CASH_IN_OPEN,
        zahlartId: ZAHLART_ID,
        actorUserId: ACTOR,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(
          new RegExp(`${LOCKED}.*festgeschrieben`, "i"),
        );
      }
    });

    it("markExpenseAsPaid: rejects when the new datum falls in a festgeschriebenes year (no existing abfluss)", async () => {
      const id = await seedApprovedExpense({ bizSuffix: "00004" });
      await lockYear(LOCKED);

      const res = await markExpenseAsPaid(id, {
        datum: CASH_IN_LOCKED,
        zahlartId: ZAHLART_ID,
        actorUserId: ACTOR,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(
          new RegExp(`${LOCKED}.*festgeschrieben`, "i"),
        );
      }
    });

    it("markExpenseAsPaid: allows when both existing abfluss and datum are open", async () => {
      const id = await seedApprovedExpense({
        bizSuffix: "00005",
        abflussDatum: CASH_IN_OPEN,
      });
      await lockYear(LOCKED);

      const res = await markExpenseAsPaid(id, {
        datum: CASH_IN_OPEN,
        zahlartId: ZAHLART_ID,
        actorUserId: ACTOR,
      });

      expect(res.ok).toBe(true);
    });

    // ── approveSubmission ─────────────────────────────────────────────────
    // An approved expense has abfluss NULL → it lands in
    // year_for_booking(gebucht_am) ≈ now(). The gate must use THAT landing
    // year, NOT the rechnungsdatum. So a prior-year rechnungsdatum on a
    // submission must NOT block approval when the current (landing) year is open;
    // and locking the current/landing year MUST block it.

    it("approveSubmission: a prior-year rechnungsdatum does NOT block approval (lands in current year)", async () => {
      const subId = await seedSubmission({
        bizSuffix: "00006",
        rechnungsdatum: CASH_IN_LOCKED, // prior, locked year
      });
      await lockYear(LOCKED);

      const res = await approveSubmission({
        submissionId: subId,
        actorUserId: ACTOR,
        kategorieName: EXPENSE_KAT_NAME,
      });

      // The landing year is the CURRENT year (abfluss null → gebucht_am=now()),
      // which is OPEN. A gate keyed on rechnungsdatum would wrongly reject this.
      expect(res.ok).toBe(true);
    });

    it("approveSubmission: rejects when the landing (current) year is festgeschrieben", async () => {
      const subId = await seedSubmission({
        bizSuffix: "00007",
        rechnungsdatum: null,
      });
      // Lock the current Berlin year — the year the approved expense lands in.
      const currentYear = new Date().getFullYear();
      await lockYear(currentYear);

      const res = await approveSubmission({
        submissionId: subId,
        actorUserId: ACTOR,
        kategorieName: EXPENSE_KAT_NAME,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toMatch(/festgeschrieben/i);
      }
      // No expense row created.
      const [sub] = await getDb()
        .select({ approvedExpenseId: auslagenSubmissions.approvedExpenseId })
        .from(auslagenSubmissions)
        .where(eq(auslagenSubmissions.id, subId));
      expect(sub?.approvedExpenseId).toBeNull();
      // Unlock so afterAll cleanup (DELETE) isn't blocked for current-year rows.
      await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
    });
  },
);
