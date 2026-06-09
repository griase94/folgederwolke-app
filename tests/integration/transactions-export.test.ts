/**
 * Phase 8 / Task 2 — per-tab CSV export endpoints + no-pagination listXPage
 * path.
 *
 * Covers:
 *   - limit:"all" returns ALL rows matching the filter, proven NON-VACUOUSLY:
 *     each tab seeds > PAGE_SIZE rows in a dedicated isolated year and asserts
 *     rows.length > PAGE_SIZE, so a regression that left .limit(50) on the
 *     limit:"all" path would FAIL (it could not return 51 rows).
 *   - A filter (year) NARROWS the exported set vs. unfiltered.
 *   - A non-default ?sort reorders the rows (asc.first < desc.first on a
 *     distinct-betrag corpus, so a no-op sort is ruled out).
 *   - The ACTUAL exported GET RequestHandler returns text/csv with an
 *     attachment Content-Disposition and a UTF-8 BOM body (real wiring, not a
 *     formula re-derivation).
 *   - D1 parity: an expense with sphereOverride ≠ sphereSnapshot emits
 *     Sphäre(Snapshot) ≠ Sphäre(Effektiv) in the CSV.
 *
 * DB-backed → RESET lane. Skipped when DIRECT_DATABASE_URL is unset.
 *
 * Seeding strategy: rows are inserted directly via raw SQL (same pattern as
 * markExpenseAsPaid.test.ts) to avoid event-bus overhead and to control
 * sphere_override. Each tab uses its OWN isolated year + 9XXX business-id
 * prefix so corpus + sibling reset-lane seeds never affect the counts, with
 * matching cleanup in afterAll.
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
import { ALL_YEARS } from "$lib/domain/year.js";
import { SPHERE_LABEL } from "$lib/server/export/transactions-csv.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const SEED_COUNT = PAGE_SIZE + 1; // 51 rows — strictly above one page.

// Each tab gets its OWN isolated year (none used by the corpus or by
// createX-based sibling reset-lane seeds, which book in the CURRENT year).
const AUS_YEAR = 2033;
const EIN_YEAR = 2034;
const SPE_YEAR = 2035;

// ---------------------------------------------------------------------------
// Kategorie resolution
// ---------------------------------------------------------------------------

async function anyKategorie(
  kind: "expense" | "income",
): Promise<{ id: string; name: string; sphere: string }> {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, kind))
    .limit(1);
  if (!row) throw new Error(`no ${kind} kategorie seeded`);
  return row;
}

// ---------------------------------------------------------------------------
// Seed helpers — one row each, parametrized by index + betrag.
// ---------------------------------------------------------------------------

/** Insert a single expense in AUS_YEAR with optional sphere_override. */
async function insertTestExpense(opts: {
  idx: number;
  betragCents?: number;
  sphereOverride?: string | null;
  sphereSnapshot?: string;
}): Promise<string> {
  const db = getDb();
  const kat = await anyKategorie("expense");
  const sphereSnap = opts.sphereSnapshot ?? kat.sphere;
  const businessId = `A-${AUS_YEAR}-9${String(opts.idx).padStart(6, "0")}`;
  const betragCents = opts.betragCents ?? 100 + opts.idx;
  const gebuchtAm = `${AUS_YEAR}-06-15T10:00:00Z`;
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
  if (!rows[0]) throw new Error(`INSERT expense failed for idx=${opts.idx}`);
  return rows[0].id;
}

/** Insert a single income row in EIN_YEAR. */
async function insertTestIncome(opts: {
  idx: number;
  betragCents?: number;
}): Promise<string> {
  const db = getDb();
  const kat = await anyKategorie("income");
  const businessId = `E-${EIN_YEAR}-9${String(opts.idx).padStart(6, "0")}`;
  const betragCents = opts.betragCents ?? 100 + opts.idx;
  const gebuchtAm = `${EIN_YEAR}-06-15T10:00:00Z`;

  const rows = (await db.execute(sql`
    INSERT INTO income (
      business_id, bezeichnung, betrag_cents, currency,
      sphere_snapshot, kategorie_id, kategorie_name_snapshot,
      gebucht_am
    ) VALUES (
      ${businessId},
      ${"Export-Income " + opts.idx},
      ${betragCents},
      'EUR',
      ${kat.sphere},
      ${kat.id}::uuid,
      ${kat.name},
      ${gebuchtAm}::timestamptz
    )
    RETURNING id
  `)) as unknown as { id: string }[];
  if (!rows[0]) throw new Error(`INSERT income failed for idx=${opts.idx}`);
  return rows[0].id;
}

/** Insert a single donation row in SPE_YEAR. */
async function insertTestDonation(opts: {
  idx: number;
  betragCents?: number;
}): Promise<string> {
  const db = getDb();
  // Donations can reuse an income kategorie id (FK only requires a real row);
  // sphere defaults to 'ideeller' which is fine for the count assertions.
  const kat = await anyKategorie("income");
  const businessId = `S-${SPE_YEAR}-9${String(opts.idx).padStart(6, "0")}`;
  const betragCents = opts.betragCents ?? 100 + opts.idx;
  const gebuchtAm = `${SPE_YEAR}-06-15T10:00:00Z`;

  const rows = (await db.execute(sql`
    INSERT INTO donations (
      business_id, betrag_cents, currency,
      sphere_snapshot, kategorie_id, kategorie_name_snapshot,
      spender_name, spende_kind, zweckbindung_kind,
      gebucht_am
    ) VALUES (
      ${businessId},
      ${betragCents},
      'EUR',
      'ideeller',
      ${kat.id}::uuid,
      ${kat.name},
      ${"Spender " + opts.idx},
      'geldspende',
      'zweckfrei',
      ${gebuchtAm}::timestamptz
    )
    RETURNING id
  `)) as unknown as { id: string }[];
  if (!rows[0]) throw new Error(`INSERT donation failed for idx=${opts.idx}`);
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupTestRows(): Promise<void> {
  const db = getDb();
  await db.execute(
    sql`DELETE FROM expenses WHERE business_id LIKE ${"A-" + AUS_YEAR + "-9%"}`,
  );
  await db.execute(
    sql`DELETE FROM income WHERE business_id LIKE ${"E-" + EIN_YEAR + "-9%"}`,
  );
  await db.execute(
    sql`DELETE FROM donations WHERE business_id LIKE ${"S-" + SPE_YEAR + "-9%"}`,
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)("transactions export (Phase 8 T2)", () => {
  beforeAll(async () => {
    // Seed SEED_COUNT (51) rows for each tab so limit:"all" must return > one
    // page. betrag = idx * 10 makes amounts DISTINCT for the sort test.
    for (let i = 1; i <= SEED_COUNT; i++) {
      await insertTestExpense({ idx: i, betragCents: i * 10 });
      await insertTestIncome({ idx: i, betragCents: i * 10 });
      await insertTestDonation({ idx: i, betragCents: i * 10 });
    }
  }, 60_000);

  afterAll(async () => {
    await cleanupTestRows();
  });

  // ── Step A: limit:"all" returns the full set (> PAGE_SIZE) for ALL tabs ────

  it("ausgaben limit:all returns > PAGE_SIZE rows (no LIMIT applied)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows, total } = await listAusgabenPage({
      state,
      year: AUS_YEAR,
      limit: "all",
      offset: 0,
    });
    expect(rows.length).toBe(total);
    expect(rows.length).toBeGreaterThanOrEqual(SEED_COUNT);
    // Falsifiable: a stray .limit(50) on the limit:"all" path would cap at 50.
    expect(rows.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("einnahmen limit:all returns > PAGE_SIZE rows (no LIMIT applied)", async () => {
    const state = parseFilterState("einnahmen", new URLSearchParams(""));
    const { rows, total } = await listEinnahmenPage({
      state,
      year: EIN_YEAR,
      limit: "all",
      offset: 0,
    });
    expect(rows.length).toBe(total);
    expect(rows.length).toBeGreaterThanOrEqual(SEED_COUNT);
    expect(rows.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("spenden limit:all returns > PAGE_SIZE rows (no LIMIT applied)", async () => {
    const state = parseFilterState("spenden", new URLSearchParams(""));
    const { rows, total } = await listSpendenPage({
      state,
      year: SPE_YEAR,
      limit: "all",
      offset: 0,
    });
    expect(rows.length).toBe(total);
    expect(rows.length).toBeGreaterThanOrEqual(SEED_COUNT);
    expect(rows.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("ausgaben limit:N still pages normally (sanity for the conditional)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows } = await listAusgabenPage({
      state,
      year: AUS_YEAR,
      limit: PAGE_SIZE,
      offset: 0,
    });
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
      year: AUS_YEAR,
      limit: "all",
      offset: 0,
    });
    // ALL_YEARS must include more rows than AUS_YEAR alone.
    expect(all.rows.length).toBeGreaterThan(yearOnly.rows.length);
    // AUS_YEAR export contains exactly our seeded rows (corpus never uses 2033).
    expect(yearOnly.rows.length).toBe(SEED_COUNT);
  });

  // ── Sort reorders the rows (distinct betrags rule out a no-op sort) ────────

  it("sort=betrag reorders ausgaben rows: asc.first < desc.first", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const opts = { state, year: AUS_YEAR, limit: "all", offset: 0 } as const;

    const asc = await listAusgabenPage({ ...opts, sort: "betrag", dir: "asc" });
    const desc = await listAusgabenPage({
      ...opts,
      sort: "betrag",
      dir: "desc",
    });

    // ascending must be monotonically non-decreasing.
    const ascAmounts = asc.rows.map((r) => r.betragCents);
    for (let i = 1; i < ascAmounts.length; i++) {
      expect(ascAmounts[i]!).toBeGreaterThanOrEqual(ascAmounts[i - 1]!);
    }
    // The crux: distinct betrags ⇒ the asc head is strictly below the desc
    // head. If sort were ignored both queries would return the SAME first row.
    expect(asc.rows[0]!.betragCents).toBeLessThan(desc.rows[0]!.betragCents);
    // smallest = 1*10 = 10, largest = 51*10 = 510.
    expect(asc.rows[0]!.betragCents).toBe(10);
    expect(desc.rows[0]!.betragCents).toBe(SEED_COUNT * 10);
  });

  // ── Real handler: invoke the shipped GET RequestHandler ───────────────────
  // Mirrors tests/unit/c1-eur-endpoints.test.ts — proves the actual wiring
  // (Content-Type / Content-Disposition / BOM) rather than re-deriving it.

  it("ausgaben export handler returns text/csv attachment with UTF-8 BOM body", async () => {
    const mod = await import("../../src/routes/app/ausgaben/export/+server.ts");
    const handler = mod.GET;
    expect(typeof handler).toBe("function");

    // The handler only reads url.searchParams. Pin the year to AUS_YEAR so the
    // body contains our seeded rows.
    const event = {
      url: new URL(`https://x.test/app/ausgaben/export?year=${AUS_YEAR}`),
    } as unknown as Parameters<typeof handler>[0];
    const res = await handler(event);

    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition.startsWith("attachment; filename=")).toBe(true);
    // filename reflects the active year scope + a Berlin-local date.
    expect(disposition).toMatch(
      /attachment; filename="ausgaben-\d{4}-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    // arrayBuffer preserves the BOM (TextDecoder default strips it).
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(buf);
    expect(text).toMatch(/Datum;Buchung-Nr;Bezeichnung/);
    // Our seeded rows are present (proves the year scope reached the query).
    expect(text).toContain(`A-${AUS_YEAR}-9`);
  });

  // ── D1 parity: sphereOverride → Sphäre(Effektiv) in Ausgaben CSV ─────────

  it("D1 parity: expense with sphereOverride != snapshot renders both columns distinctly in CSV", async () => {
    const snapshotSphere = "ideeller";
    const overrideSphere = "wirtschaftlich";
    const id = await insertTestExpense({
      idx: 99000, // outside the SEED_COUNT range
      sphereSnapshot: snapshotSphere,
      sphereOverride: overrideSphere,
      betragCents: 42_00,
    });

    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows } = await listAusgabenPage({
      state,
      year: AUS_YEAR,
      limit: "all",
      offset: 0,
    });

    const row = rows.find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row!.sphereSnapshot).toBe(snapshotSphere);
    expect(row!.sphereOverride).toBe(overrideSphere);
    expect(row!.sphereEffective).toBe(overrideSphere);

    const { buildTransactionsCsv } =
      await import("$lib/server/export/transactions-csv.js");
    const csv = buildTransactionsCsv([row!], "ausgaben");

    const snapshotLabel = SPHERE_LABEL[snapshotSphere] ?? snapshotSphere;
    const effectiveLabel = SPHERE_LABEL[overrideSphere] ?? overrideSphere;
    expect(snapshotLabel).not.toBe(effectiveLabel); // sanity
    expect(csv).toContain(snapshotLabel);
    expect(csv).toContain(effectiveLabel);

    // The two sphere columns (5th + 6th, 0-indexed) must differ in the data row.
    const lines = csv.split("\r\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const cells = lines[1]!.split(";");
    const col4 = cells[4] ?? ""; // Sphäre (Snapshot)
    const col5 = cells[5] ?? ""; // Sphäre (Effektiv)
    expect(col4).toContain(snapshotLabel);
    expect(col5).toContain(effectiveLabel);
    expect(col4).not.toBe(col5);
  });

  // ── FIX-3: Real handler tests for einnahmen + spenden export ─────────────
  // Mirrors the ausgaben handler test above — proves actual Content-Type,
  // Content-Disposition, UTF-8 BOM wiring and that seeded rows appear in body.

  it("einnahmen export handler returns text/csv attachment with UTF-8 BOM body", async () => {
    const mod =
      await import("../../src/routes/app/einnahmen/export/+server.ts");
    const handler = mod.GET;
    expect(typeof handler).toBe("function");

    const event = {
      url: new URL(`https://x.test/app/einnahmen/export?year=${EIN_YEAR}`),
    } as unknown as Parameters<typeof handler>[0];
    const res = await handler(event);

    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition.startsWith("attachment; filename=")).toBe(true);
    expect(disposition).toMatch(
      /attachment; filename="einnahmen-\d{4}-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(buf);
    // Our seeded rows use the E-EIN_YEAR-9 business-id prefix.
    expect(text).toContain(`E-${EIN_YEAR}-9`);
  });

  it("spenden export handler returns text/csv attachment with UTF-8 BOM body", async () => {
    const mod = await import("../../src/routes/app/spenden/export/+server.ts");
    const handler = mod.GET;
    expect(typeof handler).toBe("function");

    const event = {
      url: new URL(`https://x.test/app/spenden/export?year=${SPE_YEAR}`),
    } as unknown as Parameters<typeof handler>[0];
    const res = await handler(event);

    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition.startsWith("attachment; filename=")).toBe(true);
    expect(disposition).toMatch(
      /attachment; filename="spenden-\d{4}-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(buf);
    // Our seeded rows use the S-SPE_YEAR-9 business-id prefix.
    expect(text).toContain(`S-${SPE_YEAR}-9`);
  });
});
