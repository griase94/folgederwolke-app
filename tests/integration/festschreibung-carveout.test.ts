/**
 * ADR-0006 Nachtrag — the Festschreibung trigger carve-outs (migration 0038),
 * tested at the SQL layer (raw UPDATEs as app_runtime, the role the trigger
 * enforces). Seeding runs via the superuser admin connection (bypasses the
 * trigger) so we can plant festgeschriebene rows.
 *
 * Proves, on a locked Buchungsjahr:
 *   - expenses: the payment set {erstattet_am, zahlungsart_id, status,
 *     updated_at} passes; a booking column (betrag_cents / abfluss_datum) → 23514.
 *   - donations: the certificate set {bescheinigung_nr, bescheinigung_ausgestellt_am,
 *     bescheinigung_ausgestellt_von_user_id, bescheid_typ, updated_at} passes; a
 *     booking column (betrag_cents) → 23514; the F31 PII-erasure carve-out still
 *     passes (both donations branches coexist).
 *   - income: NO carve-out — even a single-column UPDATE → 23514 (fully locked).
 *
 * @phase-9
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
} from "./_helpers/festschreibung-reset.js";

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = !!DIRECT_DATABASE_URL;
const LOCKED = 2025; // seed rows in 2025, lock festgeschrieben_bis = 2025

/** Run a guarded UPDATE as app_runtime; resolve on success, capture the error. */
async function tryUpdate(query: ReturnType<typeof sql>): Promise<{
  ok: boolean;
  code?: string;
}> {
  try {
    await getDb().execute(query);
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code;
    return {
      ok: false,
      code: code ?? (err as { cause?: { code?: string } }).cause?.code,
    };
  }
}

describe.skipIf(!dbConfigured)(
  "Festschreibung carve-out trigger (0038)",
  () => {
    let admin: ReturnType<typeof postgres>;
    const EXP = "a0000000-0000-4000-8000-000000000e01";
    const DON = "a0000000-0000-4000-8000-000000000d01";
    const INC = "a0000000-0000-4000-8000-000000000c01";

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      // kategorie_id is NOT NULL on all three tables — grab a real one per kind.
      const [ek] = await admin<{ id: string }[]>`
        SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      const [ik] = await admin<{ id: string }[]>`
        SELECT id FROM kategorien WHERE kind = 'income' LIMIT 1`;
      const EKAT = ek!.id;
      const IKAT = ik!.id; // donations book as income-kind kategorien

      // Seed festgeschriebene-year rows via superuser (bypasses the trigger).
      await admin`
      INSERT INTO expenses (
        id, business_id, source, betrag_cents, currency, bezeichnung,
        abfluss_datum, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezahlt_von_kind, bezahlt_von_display, status, beleg_verzicht_grund
      ) VALUES (
        ${EXP}::uuid, ${"A-2025-90001"}, 'app', 5000, 'EUR', 'carveout fixture',
        '2025-06-01'::date, ${EKAT}::uuid, 'Sonstiges', 'ideeller',
        'verein', 'Verein', 'erstattet', 'fixture — kein Beleg'
      )`;
      await admin`
      INSERT INTO donations (
        id, business_id, source, betrag_cents, currency, spende_kind,
        zweckbindung_kind, betriebsvermoegen, zugewendet_am,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot, spender_name, spender_adresse
      ) VALUES (
        ${DON}::uuid, ${"S-2025-90001"}, 'app', 5000, 'EUR', 'geldspende',
        'zweckfrei', false, '2025-06-01'::date,
        ${IKAT}::uuid, 'Geldspende', 'ideeller', 'Erika Externe', 'Hauptstr. 1, 10115 Berlin'
      )`;
      await admin`
      INSERT INTO income (
        id, business_id, source, betrag_cents, currency, bezeichnung,
        geld_eingang_datum, kategorie_id, kategorie_name_snapshot, sphere_snapshot
      ) VALUES (
        ${INC}::uuid, ${"E-2025-90001"}, 'app', 5000, 'EUR', 'income fixture',
        '2025-06-01'::date, ${IKAT}::uuid, 'Sonstiges', 'ideeller'
      )`;

      await admin`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    });

    afterAll(async () => {
      await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
      await admin`DELETE FROM expenses WHERE id = ${EXP}::uuid`;
      await admin`DELETE FROM donations WHERE id = ${DON}::uuid`;
      await admin`DELETE FROM income WHERE id = ${INC}::uuid`;
      await admin.end();
      await resetFestgeschreibungBis();
      await closeAdminConnection();
    });

    // ── expenses ────────────────────────────────────────────────────────────
    it("expenses: payment columns pass on a festgeschriebene Auslage", async () => {
      const r = await tryUpdate(sql`
      UPDATE expenses
         SET erstattet_am = '2026-01-15'::date,
             zahlungsart_id = NULL,
             status = 'erstattet',
             updated_at = NOW()
       WHERE id = ${EXP}::uuid`);
      expect(r.ok).toBe(true);
    });

    it("expenses: a booking column (betrag_cents) is BLOCKED (23514)", async () => {
      const r = await tryUpdate(sql`
      UPDATE expenses SET betrag_cents = 9999 WHERE id = ${EXP}::uuid`);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("23514");
    });

    it("expenses: moving abfluss_datum (Buchungsjahr driver) is BLOCKED", async () => {
      const r = await tryUpdate(sql`
      UPDATE expenses SET abfluss_datum = '2026-06-01'::date WHERE id = ${EXP}::uuid`);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("23514");
    });

    // ── donations ───────────────────────────────────────────────────────────
    it("donations: certificate columns pass on a festgeschriebene Spende", async () => {
      const r = await tryUpdate(sql`
      UPDATE donations
         SET bescheinigung_nr = 'B-2025-901',
             bescheinigung_ausgestellt_am = '2026-01-15'::date,
             bescheid_typ = 'geldspende',
             updated_at = NOW()
       WHERE id = ${DON}::uuid`);
      expect(r.ok).toBe(true);
    });

    it("donations: a booking column (betrag_cents) is BLOCKED (23514)", async () => {
      const r = await tryUpdate(sql`
      UPDATE donations SET betrag_cents = 9999 WHERE id = ${DON}::uuid`);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("23514");
    });

    it("donations: the F31 PII-erasure carve-out still passes (branches coexist)", async () => {
      const r = await tryUpdate(sql`
      UPDATE donations
         SET spender_name = NULL, spender_adresse = NULL, spender_email = NULL,
             updated_at = NOW()
       WHERE id = ${DON}::uuid`);
      expect(r.ok).toBe(true);
    });

    // ── income (no carve-out — fully locked) ──────────────────────────────────
    it("income: ANY column change is BLOCKED (no carve-out, 23514)", async () => {
      const r = await tryUpdate(sql`
      UPDATE income SET updated_at = NOW() WHERE id = ${INC}::uuid`);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("23514");
    });
  },
);
