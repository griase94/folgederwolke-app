// @vitest-environment node
/**
 * S4 — paid Beiträge in the Einnahmen list, its KPI header and its CSV export.
 *
 * This is the surface the original finding was reported on: the Dashboard-KPI
 * counted paid Beiträge, /app/einnahmen did not, so the click from the KPI into
 * the list landed on a visibly smaller number and a Kassenwart could not
 * reconcile a bank statement against the app.
 *
 * The assertions that matter are the agreements — list vs KPI vs Dashboard vs
 * CSV — because any one of them drifting is exactly how the original bug came
 * about.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { listEinnahmenPage } from "$lib/server/domain/transactions.js";
import { listEinnahmenKpi } from "$lib/server/domain/einnahmen-kpi.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import { buildTransactionsCsv } from "$lib/server/export/transactions-csv.js";
import { loadDashboardKpis } from "$lib/server/domain/dashboard.js";
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";
import { seedMember } from "../helpers/db-seed.js";

const YEAR = 2026;
const PAID_ON = `${YEAR}-04-18`;

const state = (params: Record<string, string> = {}) =>
  parseFilterState("einnahmen", new URLSearchParams(params));

const list = (params: Record<string, string> = {}) =>
  listEinnahmenPage({
    state: state(params),
    year: YEAR,
    limit: "all",
    offset: 0,
  });

describe("S4 — Beiträge in the Einnahmen list", () => {
  beforeAll(async () => {
    const payer = await seedMember({ name: "EinListeZahler" });
    const db = getDb();
    await db.execute(sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents)
      VALUES (${payer.id}::uuid, ${YEAR}, 6969, 0)
      ON CONFLICT (member_id, year) DO NOTHING
    `);
    const paid = await markBeitragPaid({
      memberId: payer.id,
      year: YEAR,
      gezahltAm: PAID_ON,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(paid.ok).toBe(true);
  });

  it("lists Beiträge as read-only rows that link to the Mitglied", async () => {
    const { rows } = await list();
    const beitraege = rows.filter((r) => r.kind === "beitrag");
    expect(beitraege.length).toBeGreaterThan(0);
    for (const r of beitraege) {
      expect(r.businessId).toMatch(/^MB-\d{4}-[0-9a-f]{8}$/);
      expect(r.bezeichnung).toMatch(/^Mitgliedsbeitrag \d{4} · \S/);
      expect(r.memberId).toBeTruthy();
      expect(r.sphereSnapshot).toBe("ideeller");
      // No Rechnung and no Festschreibungs-Stempel of its own: the Beitrag is
      // owned by the Matrix, this list only shows it.
      expect(r.rechnungBusinessId).toBeNull();
      expect(r.festgeschriebenAt).toBeNull();
    }
    // Real income rows keep their shape — no member leaked onto them.
    for (const r of rows.filter((r) => r.kind === "income"))
      expect(r.memberId).toBeNull();
  });

  it("the list total counts Beiträge (pagination stays honest)", async () => {
    const { rows, total } = await list();
    expect(total).toBe(rows.length);
    const paged = await listEinnahmenPage({
      state: state(),
      year: YEAR,
      limit: 2,
      offset: 0,
    });
    expect(paged.total).toBe(total);
    expect(paged.rows.length).toBe(2);
  });

  it("KPI header, list sum and Dashboard all report the same money", async () => {
    const { rows } = await list();
    const listSum = rows.reduce((a, r) => a + r.betragCents, 0);
    const kpi = await listEinnahmenKpi(YEAR);

    expect(kpi.totalCents).toBe(listSum);
    expect(kpi.count).toBe(rows.length);

    // The reported bug in one assertion: the Einnahmen-KPI's ideeller bucket
    // used to be a fraction of the Dashboard's because it omitted Beiträge.
    const dash = await loadDashboardKpis();
    if (dash.cashflow.year === YEAR) {
      expect(kpi.bySphere.ideeller).toBe(
        dash.cashflow.einnahmenBySphereCents.ideeller,
      );
    }
  });

  it("the CSV carries Beiträge and labels them as such", async () => {
    const { rows } = await list();
    const csv = buildTransactionsCsv(rows, "einnahmen");
    const lines = csv.trim().split("\r\n");
    expect(lines.length - 1).toBe(rows.length); // header + one line per row
    expect(csv).toContain("Mitgliedsbeitrag");
    // The Art column distinguishes them from ordinary Einnahmen.
    const beitragLine = lines.find((l) => l.includes("MB-"));
    expect(beitragLine).toBeDefined();
    expect(beitragLine!).toContain("Mitgliedsbeitrag");
  });

  describe("honesty rule", () => {
    it("a Kategorie filter drops Beiträge and the UI is told why", async () => {
      const params = { kategorie: "Sonstige Einnahme (Ideell)" };
      const { rows } = await list(params);
      expect(rows.some((r) => r.kind === "beitrag")).toBe(false);
      const { einnahmenBeitragExclusionHint } =
        await import("$lib/domain/transaction-filters.js");
      expect(einnahmenBeitragExclusionHint(state(params))).toMatch(/Kategorie/);
    });

    it("„mit Rechnung“ drops Beiträge and the UI is told why", async () => {
      const params = { mitRechnung: "true" };
      const { rows } = await list(params);
      expect(rows.some((r) => r.kind === "beitrag")).toBe(false);
      const { einnahmenBeitragExclusionHint } =
        await import("$lib/domain/transaction-filters.js");
      expect(einnahmenBeitragExclusionHint(state(params))).toMatch(/Rechnung/);
    });

    it("Sphäre filters Beiträge rather than excluding them", async () => {
      const withIdeeller = await list({ sphaere: "ideeller" });
      expect(withIdeeller.rows.some((r) => r.kind === "beitrag")).toBe(true);
      const other = await list({ sphaere: "wirtschaftlich" });
      expect(other.rows.some((r) => r.kind === "beitrag")).toBe(false);
    });
  });

  it("sorts across both sources, not per-source", async () => {
    const byBetrag = await listEinnahmenPage({
      state: state(),
      year: YEAR,
      limit: "all",
      offset: 0,
      sort: "betrag",
      dir: "desc",
    });
    const amounts = byBetrag.rows.map((r) => r.betragCents);
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    // …and a Beitrag genuinely sits somewhere in that ordering.
    expect(byBetrag.rows.some((r) => r.kind === "beitrag")).toBe(true);
  });

  it("finds a Beitrag by the member's name in the list search", async () => {
    const hit = await list({ q: "EinListeZahler" });
    expect(hit.rows.length).toBeGreaterThan(0);
    expect(hit.rows.every((r) => r.kind === "beitrag")).toBe(true);
  });
});
