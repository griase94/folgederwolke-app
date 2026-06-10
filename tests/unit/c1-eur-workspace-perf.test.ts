/**
 * @vitest-environment node
 * @phase-2
 *
 * Performance test (spec §707 critical-path-coverage for C1):
 *   median(loadEurWorkspaceData) over 5 runs against 1,000-row fixtures < 200ms.
 *
 * Mirrors the dashboard perf test (cycle C3) — same seed pattern, same
 * methodology so the regression curve is comparable across clusters.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";

const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "loadEurWorkspaceData perf on 1k-row fixture (C1)",
  () => {
    let sql: ReturnType<typeof postgres>;
    const PERF_YEAR = 2023;

    beforeAll(async () => {
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      const [k] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind = 'income' LIMIT 1`;
      const [ke] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      if (!k || !ke) {
        throw new Error("c1 perf fixture: missing seeded kategorien");
      }

      // Seed 500 income + 500 expense rows in the C1 perf year, spread
      // evenly across 12 months. 1000 rows total per the spec's perf clause.
      const incomeRows = Array.from({ length: 500 }, (_, i) => {
        const month = (i % 12) + 1;
        const day = ((i * 7) % 28) + 1;
        return {
          business_id: `E-${PERF_YEAR}-${String(800000 + i).padStart(6, "0")}`,
          gebucht_am: `${PERF_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 10:00:00+01`,
          betrag_cents: 12345 + i,
          bezeichnung: `c1-perf-income-${i}`,
          kategorie_id: k.id,
          kategorie_name_snapshot: k.name,
          sphere_snapshot: k.sphere,
        };
      });
      const expenseRows = Array.from({ length: 500 }, (_, i) => {
        const month = (i % 12) + 1;
        const day = ((i * 7) % 28) + 1;
        return {
          business_id: `A-${PERF_YEAR}-${String(800000 + i).padStart(6, "0")}`,
          gebucht_am: `${PERF_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} 10:00:00+01`,
          betrag_cents: 5432 + i,
          bezeichnung: `c1-perf-expense-${i}`,
          kategorie_id: ke.id,
          kategorie_name_snapshot: ke.name,
          sphere_snapshot: ke.sphere,
          bezahlt_von_kind: "verein" as const,
          bezahlt_von_display: "Vereinskasse (c1 perf)",
          // P1-T10: expenses_beleg_or_grund_ck requires a Beleg or a
          // Belegverzicht-Begründung; synthetic perf rows carry no file.
          beleg_verzicht_grund: "c1 perf fixture — kein Beleg",
        };
      });

      await sql`INSERT INTO income ${sql(
        incomeRows,
        "business_id",
        "gebucht_am",
        "betrag_cents",
        "bezeichnung",
        "kategorie_id",
        "kategorie_name_snapshot",
        "sphere_snapshot",
      )}`;
      await sql`INSERT INTO expenses ${sql(
        expenseRows,
        "business_id",
        "gebucht_am",
        "betrag_cents",
        "bezeichnung",
        "kategorie_id",
        "kategorie_name_snapshot",
        "sphere_snapshot",
        "bezahlt_von_kind",
        "bezahlt_von_display",
        "beleg_verzicht_grund",
      )}`;
    }, 30_000);

    afterAll(async () => {
      await sql`DELETE FROM income WHERE business_id LIKE ${`E-${PERF_YEAR}-8%`}`;
      await sql`DELETE FROM expenses WHERE business_id LIKE ${`A-${PERF_YEAR}-8%`}`;
      await sql.end();
    });

    it("median over 5 runs < 200ms on 1,000-row fixture", async () => {
      const { loadEurWorkspaceData } = await import("$lib/server/eur/load.js");

      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        await loadEurWorkspaceData(PERF_YEAR);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      const median = samples[2]!;

      console.log(
        `[c1 perf] loadEurWorkspaceData(${PERF_YEAR}) samples (ms):`,
        samples.map((n) => n.toFixed(1)),
        `→ median ${median.toFixed(1)}ms`,
      );
      expect(median).toBeLessThan(200);
    }, 30_000);
  },
);
