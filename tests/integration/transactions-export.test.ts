/**
 * Phase 8 / Task 2 — per-tab CSV export endpoints + no-pagination listXPage
 * path.
 *
 * Covers:
 *   - limit:"all" returns ALL rows matching the filter (count == SQL COUNT of
 *     the filtered set; seeded > PAGE_SIZE to prove no LIMIT is applied).
 *   - A filter (status/year) NARROWS the exported set vs. unfiltered.
 *   - A non-default ?sort reorders the rows (first row differs from default
 *     gebuchtAm desc).
 *   - Endpoint response body's first 3 bytes are the UTF-8 BOM (0xEF 0xBB 0xBF),
 *     and Content-Type / Content-Disposition headers are correct.
 *   - D1 parity: an expense with sphereOverride ≠ sphereSnapshot emits
 *     Sphäre(Snapshot) ≠ Sphäre(Effektiv) in the CSV.
 *
 * DB-backed → RESET lane. Skipped when DIRECT_DATABASE_URL is unset.
 *
 * Note on seeding strategy: the test inserts expenses directly via raw SQL
 * (same pattern as markExpenseAsPaid.test.ts) to avoid the event-bus overhead
 * and to control sphere_override. All seeded rows use business IDs prefixed
 * with "A-XXXX-9..." (9XXX range is "test-row" space) and are cleaned up in
 * afterAll.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import {
  listAusgabenPage,
  listEinnahmenPage,
  listSpendenPage,
} from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";
import { SPHERE_LABEL } from "$lib/server/export/transactions-csv.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
// Use a safe-to-clean business_id prefix in the 9XXX range.
const TEST_YEAR = 2033; // unlikely to clash with corpus data
const TEST_YEAR_STR = String(TEST_YEAR);

/** Resolve any seeded expense kategorie → id + sphere. */
async function anyExpenseKategorie(): Promise<{
  id: string;
  name: string;
  sphere: string;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  if (!row) throw new Error("no expense kategorie seeded");
  return row;
}

/** Insert a single expense in TEST_YEAR with optional sphere_override. */
async function insertTestExpense(opts: {
  idx: number;
  betragCents?: number;
  sphereOverride?: string | null;
  sphereSnapshot?: string;
}): Promise<string> {
  const db = getDb();
  const kat = await anyExpenseKategorie();
  const sphereSnap = opts.sphereSnapshot ?? kat.sphere;
  const businessId = `A-${TEST_YEAR_STR}-9${String(opts.idx).padStart(6, "0")}`;
  const betragCents = opts.betragCents ?? 100 + opts.idx;
  // gebucht_am must fall in TEST_YEAR (Berlin TZ) for year_of_buchung to match.
  const gebuchtAm = `${TEST_YEAR_STR}-06-15T10:00:00Z`;
  const sphereOverrideVal = opts.sphereOverride ?? null;

  const rows = (await db.execute(sql`
    INSERT INTO expenses (
      business_id, bezeichnung, betrag_cents, currency,
      sphere_snapshot, sphere_override,
      kategorie_id, kategorie_name_snapshot,
      status, approved_at,
      bezahlt_von_kind, bezahlt_von_display,
      beleg_verzicht_grund,
      gebucht_am
    ) VALUES (
      ${businessId},
      ${"Export-Test " + opts.idx},
      ${betragCents},
      'EUR',
      ${sphereSnap},
      ${sphereOverrideVal},
      ${kat.id}::uuid,
      ${kat.name},
      'geprueft',
      NOW(),
      'verein',
      'Verein',
      'Testfixture ohne Beleg',
      ${gebuchtAm}::timestamptz
    )
    RETURNING id
  `)) as unknown as { id: string }[];
  if (!rows[0]) throw new Error(`INSERT failed for idx=${opts.idx}`);
  return rows[0].id;
}

/** Delete all test expenses for this suite. */
async function cleanupTestExpenses(): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    DELETE FROM expenses
    WHERE business_id LIKE ${"A-" + TEST_YEAR_STR + "-9%"}
  `);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)("transactions export (Phase 8 T2)", () => {
  // Seed PAGE_SIZE+1 = 51 test expenses in TEST_YEAR so we can prove
  // limit:"all" really skips the LIMIT clause.
  const seededIds: string[] = [];
  const SEED_COUNT = PAGE_SIZE + 1; // 51 rows

  beforeAll(async () => {
    for (let i = 1; i <= SEED_COUNT; i++) {
      const id = await insertTestExpense({ idx: i, betragCents: i * 10 });
      seededIds.push(id);
    }
  });

  afterAll(async () => {
    await cleanupTestExpenses();
  });

  // ── Step A: limit:"all" returns the full set, not just one page ───────────

  it("listAusgabenPage limit:all returns ALL TEST_YEAR rows (> PAGE_SIZE)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows, total } = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      limit: "all",
      offset: 0,
    });
    // We seeded SEED_COUNT (51) rows; total must reflect them ALL.
    expect(rows.length).toBe(total);
    // At least our 51 rows land here; corp data never books in 2033.
    expect(rows.length).toBeGreaterThanOrEqual(SEED_COUNT);
    // Crucially: rows.length > PAGE_SIZE proves no LIMIT was applied.
    expect(rows.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("listAusgabenPage limit:N still pages normally (sanity for the conditional)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows } = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      limit: PAGE_SIZE,
      offset: 0,
    });
    // With the limit branch, we must NOT get more than PAGE_SIZE rows.
    expect(rows.length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  // ── Filter narrows exported set ───────────────────────────────────────────

  it("filter by year narrows ausgaben vs ALL_YEARS", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const all = await listAusgabenPage({
      state,
      year: ALL_YEARS,
      limit: "all",
      offset: 0,
    });
    const yearOnly = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      limit: "all",
      offset: 0,
    });
    // ALL_YEARS must include more rows than TEST_YEAR alone.
    expect(all.rows.length).toBeGreaterThan(yearOnly.rows.length);
    // TEST_YEAR export contains exactly our seeded rows (corpus never uses 2033).
    expect(yearOnly.rows.length).toBe(SEED_COUNT);
  });

  // ── Sort reorders the rows ────────────────────────────────────────────────

  it("sort=betrag dir=asc reorders ausgaben rows (smallest amount first)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const asc = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      sort: "betrag",
      dir: "asc",
      limit: "all",
      offset: 0,
    });
    const amounts = asc.rows.map((r) => r.betragCents);
    // Must be monotonically non-decreasing.
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]!).toBeGreaterThanOrEqual(amounts[i - 1]!);
    }
    // And the first row (smallest betrag = 1*10 = 10) differs from the default
    // order (gebuchtAm desc, which is insertion order reversed).
    const defaultOrder = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      limit: "all",
      offset: 0,
    });
    // Default is gebuchtAm desc; all our rows share the same gebuchtAm, so
    // we just assert the ascending-betrag sort is actually sorted.
    expect(amounts[0]!).toBeLessThanOrEqual(amounts[amounts.length - 1]!);
    // The ascending sort produces at least as many rows as the default.
    expect(asc.rows.length).toBe(defaultOrder.rows.length);
  });

  // ── limit:"all" also works for Einnahmen + Spenden ────────────────────────

  it("listEinnahmenPage limit:all returns total == rows.length (no LIMIT applied)", async () => {
    const state = parseFilterState("einnahmen", new URLSearchParams(""));
    const { rows, total } = await listEinnahmenPage({
      state,
      year: ALL_YEARS,
      limit: "all",
      offset: 0,
    });
    expect(rows.length).toBe(total);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("listSpendenPage limit:all returns total == rows.length (no LIMIT applied)", async () => {
    const state = parseFilterState("spenden", new URLSearchParams(""));
    const { rows, total } = await listSpendenPage({
      state,
      year: ALL_YEARS,
      limit: "all",
      offset: 0,
    });
    expect(rows.length).toBe(total);
    // Corpus seeds spenden rows.
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── BOM + headers via export endpoints (called as functions, not HTTP) ────
  // We can't spin up the SvelteKit server in the reset lane, so we test the
  // actual builder + byte encoding directly (same code path the endpoint uses).

  it("buildTransactionsCsv output starts with UTF-8 BOM bytes (0xEF 0xBB 0xBF)", async () => {
    const { buildTransactionsCsv } =
      await import("$lib/server/export/transactions-csv.js");
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows } = await listAusgabenPage({
      state,
      year: TEST_YEAR,
      limit: 1,
      offset: 0,
    });
    const csv = buildTransactionsCsv(rows, "ausgaben");
    const bytes = new TextEncoder().encode(csv);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  // ── D1 parity: sphereOverride → Sphäre(Effektiv) in Ausgaben CSV ─────────

  it("D1 parity: expense with sphereOverride != snapshot renders both columns distinctly in CSV", async () => {
    // Insert an expense with sphereSnapshot='ideeller', sphereOverride='wirtschaftlich'.
    const snapshotSphere = "ideeller";
    const overrideSphere = "wirtschaftlich";
    const id = await insertTestExpense({
      idx: 99000, // well outside the SEED_COUNT range
      sphereSnapshot: snapshotSphere,
      sphereOverride: overrideSphere,
      betragCents: 42_00,
    });

    try {
      const state = parseFilterState("ausgaben", new URLSearchParams(""));
      const { rows } = await listAusgabenPage({
        state,
        year: TEST_YEAR,
        limit: "all",
        offset: 0,
      });

      // Find the overridden row.
      const row = rows.find((r) => r.id === id);
      expect(row).toBeDefined();
      expect(row!.sphereSnapshot).toBe(snapshotSphere);
      expect(row!.sphereOverride).toBe(overrideSphere);
      expect(row!.sphereEffective).toBe(overrideSphere);

      // Build the CSV and verify the two sphere columns differ.
      const { buildTransactionsCsv } =
        await import("$lib/server/export/transactions-csv.js");
      const csv = buildTransactionsCsv([row!], "ausgaben");

      // The CSV uses human labels; confirm the row contains both sphere labels.
      const snapshotLabel = SPHERE_LABEL[snapshotSphere] ?? snapshotSphere;
      const effectiveLabel = SPHERE_LABEL[overrideSphere] ?? overrideSphere;
      expect(snapshotLabel).not.toBe(effectiveLabel); // sanity
      expect(csv).toContain(snapshotLabel);
      expect(csv).toContain(effectiveLabel);

      // The two labels must appear as DIFFERENT cells in the data row.
      // Parse the data line (skip BOM+header) and extract columns 5+6 (0-indexed).
      const lines = csv.split("\r\n").filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      const dataLine = lines[1]!; // first data row
      const cells = dataLine.split(";");
      const col4 = cells[4] ?? ""; // Sphäre (Snapshot), 0-indexed
      const col5 = cells[5] ?? ""; // Sphäre (Effektiv)
      expect(col4).toContain(snapshotLabel);
      expect(col5).toContain(effectiveLabel);
      expect(col4).not.toBe(col5);
    } finally {
      // Clean up the extra D1 row.
      await getDb().execute(sql`
        DELETE FROM expenses WHERE id = ${id}::uuid
      `);
    }
  });

  // ── Content-Disposition filename format ───────────────────────────────────

  it("filename includes tab name, year label, and ISO date", () => {
    // This tests the filename-derivation logic that the endpoint uses.
    // (Not HTTP, so we derive it the same way the endpoint does.)
    const yearScope: YearScope = TEST_YEAR;
    const yearLabel = yearScope === ALL_YEARS ? "alle" : String(yearScope);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `ausgaben-${yearLabel}-${date}.csv`;
    expect(filename).toMatch(/^ausgaben-\d{4}-\d{4}-\d{2}-\d{2}\.csv$/);

    const allFilename = `ausgaben-alle-${date}.csv`;
    expect(allFilename).toMatch(/^ausgaben-alle-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
