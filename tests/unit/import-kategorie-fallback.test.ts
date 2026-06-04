/**
 * @phase-1
 *
 * PURE unit test (no DB) for the importer's non-null kategorie fallback.
 *
 * Contract (spec §4.6, Phase-1 Task 8): an unmatched legacy kategorie name
 * MUST resolve to the per-kind "Unkategorisiert (Import)" sentinel id, NEVER
 * null — so the importer write-path can never insert a null kategorie_id once
 * the NOT NULL constraint lands (later task).
 */

import { describe, it, expect } from "vitest";
import {
  resolveKategorie,
  type TransformContext,
} from "$lib/server/import/transform.js";

const SENTINEL_EXPENSE = "11111111-1111-1111-1111-111111111111";
const SENTINEL_INCOME = "22222222-2222-2222-2222-222222222222";

function makeCtx(): TransformContext {
  return {
    members: [],
    kategorien: [],
    projects: [],
    sourceTag: "test_import_2026",
    sentinelExpenseKategorieId: SENTINEL_EXPENSE,
    sentinelIncomeKategorieId: SENTINEL_INCOME,
  };
}

describe("importer kategorie fallback", () => {
  it("unmatched expense resolves to the expense sentinel id (never null)", () => {
    const r = resolveKategorie(makeCtx(), "expense", "Voll Unbekannt", null);
    expect(r.kategorieId).toBe(SENTINEL_EXPENSE);
  });

  it("unmatched income resolves to the income sentinel id (never null)", () => {
    const r = resolveKategorie(makeCtx(), "income", "Voll Unbekannt", null);
    expect(r.kategorieId).toBe(SENTINEL_INCOME);
  });
});
