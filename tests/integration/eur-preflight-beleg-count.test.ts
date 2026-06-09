/**
 * FIX-2: EÜR pre-flight "ohne Beleg" count alignment.
 *
 * Guards that the `missingBelegCount` SQL in `eur/load.ts` agrees with the
 * row count produced by `listAusgabenPage` with `belegFehlt=true`.
 *
 * Before the fix, the pre-flight SQL queried the legacy `beleg_drive_file_id
 * IS NULL` column, while the filter uses `beleg_file_id IS NULL AND
 * beleg_verzicht_grund IS NULL`. This caused counts to diverge: rows with a
 * new-system `beleg_file_id` but no legacy `beleg_drive_file_id` were
 * over-counted by the pre-flight, but correctly excluded by the filter.
 *
 * After the fix both paths use `beleg_file_id IS NULL AND
 * beleg_verzicht_grund IS NULL`. We run the pre-flight SQL directly (the
 * same query that `loadEurWorkspaceData` executes) and compare it to
 * `listAusgabenPage` with the belegFehlt boolean, seeding:
 *
 *  - 1 expense WITH beleg_file_id → excluded from BOTH (count=0, rows=0)
 *  - 1 expense WITH beleg_verzicht_grund → excluded from BOTH (count=0, rows=0)
 *
 * Before the fix the pre-flight count for these rows would be 2
 * (`beleg_drive_file_id IS NULL` for both), while the filter returns 0.
 * After the fix both return 0.
 *
 * DB-backed → RESET lane. Skipped when DIRECT_DATABASE_URL is unset.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { listAusgabenPage } from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import {
  seedFileViaAdmin,
  closeAdminConnection,
} from "./_helpers/festschreibung-reset.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

const TEST_YEAR = 2089;
const FILE_ID = "11111111-0000-0000-0000-000000008901";

async function anyExpenseKategorieId(): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ id: kategorien.id })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  if (!row) throw new Error("no expense kategorie seeded");
  return row.id;
}

/** Run the exact pre-flight SQL from eur/load.ts (after FIX-2). */
async function preFlightMissingBelegCount(year: number): Promise<number> {
  const db = getDb();
  const res = await db.execute<{ cnt: string }>(sql`
    SELECT count(*)::text AS cnt FROM expenses
     WHERE year_of_buchung = ${year}
       AND beleg_file_id IS NULL
       AND beleg_verzicht_grund IS NULL
  `);
  return parseInt(res[0]?.cnt ?? "0", 10);
}

describe.skipIf(!dbConfigured)(
  "EÜR pre-flight missingBelegCount == belegFehlt page count (FIX-2)",
  () => {
    beforeAll(async () => {
      const db = getDb();
      const katId = await anyExpenseKategorieId();
      const gebuchtAm = `${TEST_YEAR}-06-15T12:00:00Z`;

      // Seed a real files row so the FK on beleg_file_id is satisfied.
      await seedFileViaAdmin({
        id: FILE_ID,
        storageKey: `belege/${TEST_YEAR}/fix2-test.pdf`,
        sha256: "a".repeat(64),
        uploadedAt: gebuchtAm,
        mimeType: "application/pdf",
        originalFilename: "fix2-test.pdf",
        sourceKind: "form",
        uploadedBySubmitterEmail: "fix2-test@example.com",
      });

      // Expense A: has beleg_file_id (new system).
      // → Old pre-flight (beleg_drive_file_id IS NULL): counted (over-count bug).
      //   New pre-flight (beleg_file_id IS NULL AND …): correctly excluded.
      //   belegFehlt filter: correctly excluded.
      await db.execute(sql`
        INSERT INTO expenses (
          business_id, bezeichnung, betrag_cents, currency,
          sphere_snapshot, kategorie_id, kategorie_name_snapshot,
          status, approved_at,
          bezahlt_von_kind, bezahlt_von_display,
          beleg_file_id, beleg_verzicht_grund,
          gebucht_am
        ) VALUES (
          ${"AUS-" + TEST_YEAR + "-9900001"},
          'Hat neues Beleg',
          500,
          'EUR',
          'ideeller',
          ${katId}::uuid,
          'Test-Kat',
          'geprueft',
          NOW(),
          'verein',
          'Verein',
          ${FILE_ID}::uuid,
          NULL,
          ${gebuchtAm}::timestamptz
        )
      `);

      // Expense B: has beleg_verzicht_grund (documented waiver, no file).
      // → Old pre-flight: counted (beleg_drive_file_id IS NULL).
      //   New pre-flight: correctly excluded (beleg_verzicht_grund IS NOT NULL).
      //   belegFehlt filter: correctly excluded.
      await db.execute(sql`
        INSERT INTO expenses (
          business_id, bezeichnung, betrag_cents, currency,
          sphere_snapshot, kategorie_id, kategorie_name_snapshot,
          status, approved_at,
          bezahlt_von_kind, bezahlt_von_display,
          beleg_file_id, beleg_verzicht_grund,
          gebucht_am
        ) VALUES (
          ${"AUS-" + TEST_YEAR + "-9900002"},
          'Verzicht dokumentiert',
          200,
          'EUR',
          'ideeller',
          ${katId}::uuid,
          'Test-Kat',
          'geprueft',
          NOW(),
          'verein',
          'Verein',
          NULL,
          'Kleinbetrag unter 10 EUR',
          ${gebuchtAm}::timestamptz
        )
      `);
    }, 30_000);

    afterAll(async () => {
      const db = getDb();
      // Delete expenses before files (files FK is ON DELETE RESTRICT).
      await db.execute(
        sql`DELETE FROM expenses WHERE business_id LIKE ${"AUS-" + TEST_YEAR + "-99%"}`,
      );
      await db.execute(sql`DELETE FROM files WHERE id = ${FILE_ID}::uuid`);
      await closeAdminConnection();
    });

    it("pre-flight SQL count equals belegFehlt filter row count", async () => {
      // Run the exact post-FIX-2 pre-flight SQL.
      const preflight = await preFlightMissingBelegCount(TEST_YEAR);

      // Run the belegFehlt filter via listAusgabenPage.
      const state = parseFilterState(
        "ausgaben",
        new URLSearchParams("belegFehlt=true"),
      );
      const { rows: filteredRows } = await listAusgabenPage({
        state,
        year: TEST_YEAR,
        limit: "all",
        offset: 0,
      });

      // Both seeded rows are correctly excluded:
      //  - 9900001 has beleg_file_id → excluded from BOTH
      //  - 9900002 has beleg_verzicht_grund → excluded from BOTH
      expect(preflight).toBe(0);
      expect(filteredRows.length).toBe(0);
      // Core invariant: pre-flight SQL and fix-link page agree exactly.
      expect(preflight).toBe(filteredRows.length);
    });
  },
);
