/**
 * Phase 3 / Task 4 — getTransactionDetail per-kind detail fields.
 *
 * The DETAIL-side integration seam (analogous to the create-side `createX`):
 * `getTransactionDetail(id, kind)` must thread, additively, ALL the fields the
 * Tier-C tab detail surfaces consume — so the Ausgaben / Einnahmen / Spenden
 * tabs (and Phases 5/6) render WITHOUT ever editing `transactions.ts` again.
 *
 * Seam contract asserted here (exact names downstream depends on):
 *   - Beleg (all kinds): belegFileId, belegMimeType, belegOriginalName — the
 *     last two LEFT-JOINed off `files` (mime_type / original_filename), NOT the
 *     legacy `beleg_drive_file_id` / `beleg_original_name` text columns.
 *     null on all three when no Beleg is attached.
 *   - Einnahmen: rechnungBusinessId — the aus-Rechnung link via a correlated
 *     subquery on invoices.paid_by_income_id = income.id (same source as the
 *     Phase-2 list projection). null for non-invoice-linked income.
 *   - Spenden: wertermittlungMethode, zustandBeschreibung, herkunftsbelegFileId,
 *     zweckbindungText, spenderAdresse, betriebsvermoegen (+ zweckbindungKind).
 *
 * Self-arranging for the Beleg side (review S2 — do NOT assume the seeded
 * corpus attaches a real Beleg blob; it doesn't): seed a `files` row via the
 * superuser pool and attach it to a seeded expense + the invoice-linked income,
 * assert, then detach + delete in afterAll. The donation assertions read the
 * already-seeded Sachspende (S-2025-903) + zweckgebundene Spende (S-2025-902).
 *
 * DB-backed → RESET lane. Skipped when DIRECT_DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { getTransactionDetail } from "$lib/server/domain/transactions.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import {
  seedFileViaAdmin,
  cleanupFilesViaAdmin,
  closeAdminConnection,
  resetFestgeschreibungBis,
} from "./_helpers/festschreibung-reset.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

// Business IDs from the seeded showcase corpus (scripts/seed-fixtures.ts).
const EXPENSE_WITH_BELEG_BIZ = "A-2026-907"; // a 2026 expense to attach a Beleg to
const INCOME_WITH_INVOICE_BIZ = "E-2026-905"; // ← FDW-2026-901 (paid_by_income_id)
const INCOME_NO_INVOICE_BIZ = "E-2026-906"; // no invoice → rechnungBusinessId null
const SACHSPENDE_BIZ = "S-2025-903"; // wertermittlungMethode + zustandBeschreibung
const ZWECKGEBUNDEN_BIZ = "S-2025-902"; // zweckbindungText + zweckgebunden

const BELEG_FILE_ID = "00000000-0000-4000-8000-0000000be1e9";
const BELEG_MIME = "image/png";
const BELEG_NAME = "rechnung-scan.png";

let adminPool: ReturnType<typeof postgres> | null = null;
let expenseId = "";
let incomeWithInvoiceId = "";
let incomeNoInvoiceId = "";
let sachspendeId = "";
let zweckgebundenId = "";

function admin(): ReturnType<typeof postgres> {
  if (adminPool) return adminPool;
  adminPool = postgres(process.env["DIRECT_DATABASE_URL"]!, {
    prepare: false,
    max: 1,
  });
  return adminPool;
}

describe.skipIf(!dbConfigured)("getTransactionDetail per-kind fields", () => {
  beforeAll(async () => {
    // Clear any leftover Festschreibung lock so the admin attach/detach below
    // is never blocked, then seed a `files` row and attach it to a seeded
    // expense + the invoice-linked income via the superuser pool (bypasses
    // triggers; corpus rows aren't otherwise attached to a real Beleg blob).
    await resetFestgeschreibungBis();
    await seedFileViaAdmin({
      id: BELEG_FILE_ID,
      storageKey: `test/detail-beleg/${BELEG_FILE_ID}`,
      sha256: "b".repeat(64),
      mimeType: BELEG_MIME,
      originalFilename: BELEG_NAME,
      kind: "beleg",
    });
    const a = admin();
    await a`UPDATE expenses SET beleg_file_id = ${BELEG_FILE_ID} WHERE business_id = ${EXPENSE_WITH_BELEG_BIZ}`;
    await a`UPDATE income   SET beleg_file_id = ${BELEG_FILE_ID} WHERE business_id = ${INCOME_WITH_INVOICE_BIZ}`;

    // Resolve the UUIDs the detail query is keyed on.
    const db = getDb();
    const lookup = async (table: string, biz: string): Promise<string> => {
      const rows = (await db.execute(
        sql`SELECT id::text AS id FROM ${sql.raw(table)} WHERE business_id = ${biz} LIMIT 1`,
      )) as unknown as Array<{ id: string }>;
      const id = rows[0]?.id;
      if (!id) throw new Error(`seed corpus missing ${table}/${biz}`);
      return id;
    };
    expenseId = await lookup("expenses", EXPENSE_WITH_BELEG_BIZ);
    incomeWithInvoiceId = await lookup("income", INCOME_WITH_INVOICE_BIZ);
    incomeNoInvoiceId = await lookup("income", INCOME_NO_INVOICE_BIZ);
    sachspendeId = await lookup("donations", SACHSPENDE_BIZ);
    zweckgebundenId = await lookup("donations", ZWECKGEBUNDEN_BIZ);
  });

  afterAll(async () => {
    // Detach the Beleg from the corpus rows and delete the seeded file so the
    // shared corpus is left exactly as we found it.
    const a = admin();
    await a`UPDATE expenses SET beleg_file_id = NULL WHERE business_id = ${EXPENSE_WITH_BELEG_BIZ}`;
    await a`UPDATE income   SET beleg_file_id = NULL WHERE business_id = ${INCOME_WITH_INVOICE_BIZ}`;
    await cleanupFilesViaAdmin(BELEG_FILE_ID);
    if (adminPool) {
      await adminPool.end();
      adminPool = null;
    }
    await closeAdminConnection();
  });

  // ── Beleg (all kinds) ───────────────────────────────────────────────────────
  it("expense: returns belegFileId + belegMimeType + belegOriginalName when a Beleg file is attached", async () => {
    const detail = await getTransactionDetail(expenseId, "expense");
    expect(detail).toMatchObject({
      belegFileId: BELEG_FILE_ID,
      belegMimeType: BELEG_MIME,
      belegOriginalName: BELEG_NAME,
    });
  });

  it("expense: Beleg fields are null when no Beleg is attached", async () => {
    // A-2026-908 is seeded with belegVerzichtGrund and NO belegFileId.
    const db = getDb();
    const rows = (await db.execute(
      sql`SELECT id::text AS id FROM expenses WHERE business_id = 'A-2026-908' LIMIT 1`,
    )) as unknown as Array<{ id: string }>;
    const detail = await getTransactionDetail(rows[0]!.id, "expense");
    expect(detail!.belegFileId).toBeNull();
    expect(detail!.belegMimeType).toBeNull();
    expect(detail!.belegOriginalName).toBeNull();
  });

  it("income: returns belegFileId + belegMimeType + belegOriginalName from the files join", async () => {
    const detail = await getTransactionDetail(incomeWithInvoiceId, "income");
    expect(detail).toMatchObject({
      belegFileId: BELEG_FILE_ID,
      belegMimeType: BELEG_MIME,
      belegOriginalName: BELEG_NAME,
    });
  });

  // ── Einnahmen: aus-Rechnung link ─────────────────────────────────────────────
  it("income: exposes rechnungBusinessId for the invoice-linked receipt", async () => {
    const detail = await getTransactionDetail(incomeWithInvoiceId, "income");
    expect(detail!.rechnungBusinessId).toBe("FDW-2026-901");
  });

  it("income: rechnungBusinessId is null for non-invoice-linked income", async () => {
    const detail = await getTransactionDetail(incomeNoInvoiceId, "income");
    expect(detail!.rechnungBusinessId).toBeNull();
  });

  // ── Spenden detail fields ─────────────────────────────────────────────────────
  it("donation (Sachspende): exposes Wertermittlung fields + betriebsvermoegen", async () => {
    const detail = await getTransactionDetail(sachspendeId, "donation");
    expect(detail!.wertermittlungMethode).toBe("kaufbeleg");
    expect(detail!.zustandBeschreibung).toBe(
      "Gebrauchter PA-Lautsprecher, voll funktionsfähig.",
    );
    expect(detail).toHaveProperty("herkunftsbelegFileId");
    expect(detail!.betriebsvermoegen).toBe(false);
  });

  it("donation (zweckgebunden): exposes zweckbindungText + zweckbindungKind + spenderAdresse", async () => {
    const detail = await getTransactionDetail(zweckgebundenId, "donation");
    expect(detail!.zweckbindungText).toBe(
      "Zweckgebunden für die Nachwuchsförderung 2025.",
    );
    expect(detail!.zweckbindungKind).toBe("zweckgebunden");
    expect(detail).toHaveProperty("spenderAdresse");
  });
});
