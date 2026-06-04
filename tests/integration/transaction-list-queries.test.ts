/**
 * Phase 2 / Task 5 — per-tab paginated query functions.
 *
 * Asserts the SQL-side LIMIT/OFFSET + COUNT behaviour against the seeded
 * showcase corpus (scripts/seed-fixtures.ts → seedTransactionCorpus):
 *   - filtered queries return only matching rows + a real SQL-side `total`
 *     COUNT (NOT rows.length — exercised by a limit < total page);
 *   - LIMIT/OFFSET paging walks distinct rows and `total` stays constant;
 *   - the einnahmen LATERAL join projects `rechnungBusinessId` — non-null for
 *     the seeded invoice→income link (FDW-2026-901 → E-2026-905), null for the
 *     other income rows, with NO row duplication;
 *   - ALL_YEARS + no active filters hits the empty-conditions WHERE path and
 *     returns ALL rows without throwing (the `and()`-of-empty-array guard).
 *
 * DB-backed → RESET lane. Skipped when DIRECT_DATABASE_URL is unset.
 */
import { describe, it, expect } from "vitest";
import {
  listAusgabenPage,
  listEinnahmenPage,
  listSpendenPage,
} from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import { ALL_YEARS } from "$lib/domain/year.js";

const dbConfigured = (process.env["DIRECT_DATABASE_URL"] ?? "").length > 0;

describe.skipIf(!dbConfigured)("per-tab paginated queries", () => {
  // ── Ausgaben ──────────────────────────────────────────────────────────────
  it("ausgaben: filter status=erstattet returns only erstattet, with SQL-side total", async () => {
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=erstattet"),
    );
    const { rows, total } = await listAusgabenPage({
      state,
      year: 2026,
      limit: 5,
      offset: 0,
    });
    expect(rows.every((r) => r.status === "erstattet")).toBe(true);
    expect(typeof total).toBe("number");
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it("ausgaben: status=erstattet across ALL_YEARS yields the seeded erstattet rows + matching total", async () => {
    // Corpus seeds A-2024-901 + A-2025-904 as status=erstattet (spec §4.7).
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=erstattet"),
    );
    const { rows, total } = await listAusgabenPage({
      state,
      year: ALL_YEARS,
      limit: 50,
      offset: 0,
    });
    expect(rows.every((r) => r.status === "erstattet")).toBe(true);
    expect(total).toBeGreaterThanOrEqual(2);
    // total is the COUNT of all matches; when limit covers them all it equals rows.length.
    expect(total).toBe(rows.length);
    // the projection carries the display-specific fields the Tier-C tab binds to.
    const r = rows[0]!;
    expect(r).toHaveProperty("status");
    expect(r).toHaveProperty("bezahltVonKind");
    expect(r).toHaveProperty("bezahltVonDisplay");
    expect(r).toHaveProperty("erstattetAm");
    expect(r).toHaveProperty("belegFileId");
    expect(r).toHaveProperty("approvedAt");
  });

  it("ausgaben: LIMIT/OFFSET pages distinct rows while total stays constant (real SQL pagination)", async () => {
    // No filters, ALL_YEARS → exercises the empty-conditions WHERE = undefined path.
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const pageSize = 3;
    const page0 = await listAusgabenPage({
      state,
      year: ALL_YEARS,
      limit: pageSize,
      offset: 0,
    });
    const page1 = await listAusgabenPage({
      state,
      year: ALL_YEARS,
      limit: pageSize,
      offset: pageSize,
    });
    // total is the full COUNT, independent of the page window.
    expect(page0.total).toBe(page1.total);
    expect(page0.total).toBeGreaterThan(pageSize); // corpus has > 3 expenses
    expect(page0.rows.length).toBe(pageSize);
    // page 1 returns DIFFERENT rows than page 0 (real OFFSET, not in-memory slice of one fetch).
    const idsP0 = new Set(page0.rows.map((r) => r.id));
    expect(page1.rows.every((r) => !idsP0.has(r.id))).toBe(true);
  });

  it("ausgaben: ALL_YEARS + no filters returns ALL rows and does NOT throw (empty-conditions guard)", async () => {
    const state = parseFilterState("ausgaben", new URLSearchParams(""));
    const { rows, total } = await listAusgabenPage({
      state,
      year: ALL_YEARS,
      limit: 500,
      offset: 0,
    });
    // Corpus seeds 10 expenses; ALL_YEARS + no filter must surface them all.
    expect(total).toBeGreaterThanOrEqual(10);
    expect(rows.length).toBe(total);
  });

  // ── Einnahmen ─────────────────────────────────────────────────────────────
  it("einnahmen: mitRechnung=true returns only invoice-linked income with a non-null rechnungBusinessId", async () => {
    const state = parseFilterState(
      "einnahmen",
      new URLSearchParams("mitRechnung=true"),
    );
    const { rows, total } = await listEinnahmenPage({
      state,
      year: 2026,
      limit: 50,
      offset: 0,
    });
    // corpus seeds exactly one invoice-linked income (spec §4.7): E-2026-905 ← FDW-2026-901.
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(total).toBe(rows.length);
    expect(rows.every((r) => r.rechnungBusinessId != null)).toBe(true);
    expect(rows.some((r) => r.rechnungBusinessId === "FDW-2026-901")).toBe(
      true,
    );
  });

  it("einnahmen: LATERAL join yields rechnungBusinessId non-null for the linked row, null otherwise, with NO row duplication", async () => {
    // No mitRechnung filter → all 2026 income; the LATERAL join must not fan out rows.
    const state = parseFilterState("einnahmen", new URLSearchParams(""));
    const { rows, total } = await listEinnahmenPage({
      state,
      year: 2026,
      limit: 50,
      offset: 0,
    });
    // Corpus seeds 4 income rows in 2026 (E-2026-905..908); LATERAL must not duplicate any.
    expect(total).toBe(rows.length);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate rows from the join
    const linked = rows.filter((r) => r.rechnungBusinessId != null);
    expect(linked.length).toBe(1);
    expect(linked[0]!.rechnungBusinessId).toBe("FDW-2026-901");
    expect(linked[0]!.businessId).toBe("E-2026-905");
    // every other income row carries a null badge source.
    expect(
      rows
        .filter((r) => r.businessId !== "E-2026-905")
        .every((r) => r.rechnungBusinessId == null),
    ).toBe(true);
  });

  // ── Spenden ───────────────────────────────────────────────────────────────
  it("spenden: bescheinigung=ausstehend returns only rows without a B-Nummer", async () => {
    // Donations live in 2024/2025 → use ALL_YEARS so the assertion isn't vacuous.
    const state = parseFilterState(
      "spenden",
      new URLSearchParams("bescheinigung=ausstehend"),
    );
    const { rows, total } = await listSpendenPage({
      state,
      year: ALL_YEARS,
      limit: 50,
      offset: 0,
    });
    expect(rows.every((r) => r.bescheinigungNr == null)).toBe(true);
    // Corpus: S-2025-902 + S-2025-903 have no Bescheinigung; S-2024-901 does.
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBe(rows.length);
    // per-tab projection carries the Spenden display fields.
    const r = rows[0]!;
    expect(r).toHaveProperty("spenderName");
    expect(r).toHaveProperty("spendeKind");
    expect(r).toHaveProperty("zweckbindungKind");
    expect(r).toHaveProperty("bescheinigungNr");
  });

  it("spenden: bescheinigung=versandt returns only rows WITH a B-Nummer", async () => {
    const state = parseFilterState(
      "spenden",
      new URLSearchParams("bescheinigung=versandt"),
    );
    const { rows, total } = await listSpendenPage({
      state,
      year: ALL_YEARS,
      limit: 50,
      offset: 0,
    });
    expect(rows.every((r) => r.bescheinigungNr != null)).toBe(true);
    // Corpus: only S-2024-901 carries B-2024-901.
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.bescheinigungNr === "B-2024-901")).toBe(true);
  });
});
