/**
 * @vitest-environment node
 * @phase-c3
 *
 * Performance test (spec §707 critical-path-coverage):
 *   median(loadDashboardKpis + bucketByMonth + sparkline derivation) over
 *   5 runs against 1,000-row fixtures < 200ms.
 *
 * Strategy:
 *   • Pre-seed 1,000 income + 1,000 expense rows in test DB (in a transaction).
 *   • Call `loadDashboardKpis(year)` 5 times back-to-back, time each.
 *   • Assert the median is < 200ms.
 *
 * This test connects directly to the test DB (not mocked) and runs as part
 * of the unit suite — the global vitest setup already resets + seeds it.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";

// Skip entirely if no DB is configured (CI without docker).
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "loadDashboardKpis perf on 1k-row fixture",
  () => {
    let sql: ReturnType<typeof postgres>;
    const PERF_YEAR = 2024;

    beforeAll(async () => {
      // Seed 1000 income + 1000 expense rows in the test DB. Use the direct
      // (superuser) URL so we can bypass app_runtime CHECKs and write
      // deterministic timestamps spread evenly across 12 months of PERF_YEAR.
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });

      // Grab a real kategorie + sphere for FK satisfaction.
      const [k] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind = 'income' LIMIT 1`;
      const [ke] = await sql<
        { id: string; name: string; sphere: string }[]
      >`SELECT id, name, sphere FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      if (!k || !ke) {
        throw new Error("perf fixture: missing seeded kategorien");
      }

      // 1000 income rows — spread evenly across 12 months of PERF_YEAR
      const incomeRows = Array.from({ length: 1000 }, (_, i) => {
        const month = (i % 12) + 1;
        const day = ((i * 7) % 28) + 1;
        return {
          // Business-id format constraint: ^E-YYYY-NNN+$
          business_id: `E-${PERF_YEAR}-${String(900000 + i).padStart(6, "0")}`,
          gebucht_am: `${PERF_YEAR}-${String(month).padStart(
            2,
            "0",
          )}-${String(day).padStart(2, "0")} 10:00:00+01`,
          betrag_cents: 10000 + i,
          bezeichnung: `perf-income-${i}`,
          kategorie_id: k.id,
          kategorie_name_snapshot: k.name,
          sphere_snapshot: k.sphere,
        };
      });
      const expenseRows = Array.from({ length: 1000 }, (_, i) => {
        const month = (i % 12) + 1;
        const day = ((i * 7) % 28) + 1;
        return {
          // Business-id format constraint: ^A-YYYY-NNN+$
          business_id: `A-${PERF_YEAR}-${String(900000 + i).padStart(6, "0")}`,
          gebucht_am: `${PERF_YEAR}-${String(month).padStart(
            2,
            "0",
          )}-${String(day).padStart(2, "0")} 10:00:00+01`,
          betrag_cents: 5000 + i,
          bezeichnung: `perf-expense-${i}`,
          kategorie_id: ke.id,
          kategorie_name_snapshot: ke.name,
          sphere_snapshot: ke.sphere,
          bezahlt_von_kind: "verein" as const,
          bezahlt_von_display: "Vereinskasse (perf)",
          // P1-T10: expenses_beleg_or_grund_ck requires either a Beleg or a
          // Belegverzicht-Begründung. These synthetic perf rows carry no file,
          // so give them a Verzicht-Grund to satisfy the CHECK.
          beleg_verzicht_grund: "perf fixture — kein Beleg",
        };
      });

      await sql`INSERT INTO income ${sql(incomeRows, "business_id", "gebucht_am", "betrag_cents", "bezeichnung", "kategorie_id", "kategorie_name_snapshot", "sphere_snapshot")}`;
      await sql`INSERT INTO expenses ${sql(expenseRows, "business_id", "gebucht_am", "betrag_cents", "bezeichnung", "kategorie_id", "kategorie_name_snapshot", "sphere_snapshot", "bezahlt_von_kind", "bezahlt_von_display", "beleg_verzicht_grund")}`;
    }, 30_000);

    afterAll(async () => {
      // Clean up the perf rows so they don't pollute downstream tests
      await sql`DELETE FROM income WHERE business_id LIKE ${`E-${PERF_YEAR}-9%`}`;
      await sql`DELETE FROM expenses WHERE business_id LIKE ${`A-${PERF_YEAR}-9%`}`;
      await sql.end();
    });

    it("median over 5 runs < 200ms on 1,000-row fixture", async () => {
      // Import after seeding so the module's getDb pool is healthy.
      const { loadDashboardKpis } =
        await import("$lib/server/domain/dashboard.js");

      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        await loadDashboardKpis(PERF_YEAR);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      const median = samples[2]!;

      console.log(
        `[c3 perf] dashboard.loadDashboardKpis(${PERF_YEAR}) samples (ms):`,
        samples.map((n) => n.toFixed(1)),
        `→ median ${median.toFixed(1)}ms`,
      );
      expect(median).toBeLessThan(200);
    }, 30_000);
  },
);
