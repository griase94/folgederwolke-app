/**
 * Phase 6 / Task 1 — listSpendenKpi aggregation.
 *
 * Powers the Spenden list header KPI (spec §9.1): total + count + a disappearing
 * "N ohne Bescheinigung" pill + "M Bescheinigungen versandt". There is NO
 * Sammelbestätigungs-Fenster / deadline field — §9.1 removes it deliberately
 * (no statutory cutoff → no false signal). The KPI must therefore NOT expose any
 * deadline/window property.
 *
 * Corpus (scripts/seed-fixtures.ts → seedFixtures): exactly three seeded
 * donations —
 *   - S-2024-901 Geldspende zweckfrei, ISSUED (bescheinigungNr B-2024-901), 2024
 *   - S-2025-902 Geldspende zweckgebunden, AUSSTEHEND (no Bescheinigung), 2025
 *   - S-2025-903 Sachspende, AUSSTEHEND (no Bescheinigung), 2025
 * → ALL_YEARS: versandtCount >= 1 (the 2024 issued) AND ohneBescheinigungCount
 *   >= 2 (the two 2025 ausstehende). Year 2025: ohneBescheinigungCount >= 2.
 *
 * DB-backed → RESET lane. Skipped when DATABASE_URL/DIRECT_DATABASE_URL unset.
 */
import { describe, it, expect } from "vitest";
import { listSpendenKpi } from "$lib/server/domain/spenden-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("listSpendenKpi", () => {
  it("returns total sum + count + ohne-Bescheinigung + versandt counts", async () => {
    const kpi = await listSpendenKpi(2025);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    expect(typeof kpi.ohneBescheinigungCount).toBe("number");
    expect(typeof kpi.versandtCount).toBe("number");
    // 2025 corpus: the zweckgebundene Geldspende + the Sachspende are both
    // ausstehend (no Bescheinigung) → at least two ohne-Bescheinigung.
    expect(kpi.ohneBescheinigungCount).toBeGreaterThanOrEqual(2);
    // No deadline/Fenster field exists (spec §9.1).
    expect("sammelfensterDeadline" in kpi).toBe(false);
  });

  it("aggregates over ALL_YEARS: >=1 versandt (2024 issued) + >=2 ohne (2025)", async () => {
    const kpi = await listSpendenKpi(ALL_YEARS);
    expect(kpi.count).toBeGreaterThanOrEqual(3);
    expect(kpi.versandtCount).toBeGreaterThanOrEqual(1);
    expect(kpi.ohneBescheinigungCount).toBeGreaterThanOrEqual(2);
    // ohne + versandt partition every donation (NULL XOR NOT NULL).
    expect(kpi.ohneBescheinigungCount + kpi.versandtCount).toBe(kpi.count);
    // ALL_YEARS dominates any single-year scope.
    const kpi2025 = await listSpendenKpi(2025);
    expect(kpi.count).toBeGreaterThanOrEqual(kpi2025.count);
    expect(kpi.totalCents).toBeGreaterThanOrEqual(kpi2025.totalCents);
  });
});
