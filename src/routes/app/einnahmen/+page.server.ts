/**
 * /app/einnahmen — flat Einnahmen (income) list route shell (Phase 3, Task 10).
 *
 * Thin `load`: parse the Phase-2 filter state, read the layout year scope, clamp
 * the `?page` into range, then call `listEinnahmenPage` + the picker-option
 * loaders the Einnahmen FILTER_REGISTRY actually needs:
 *
 *   - `listKategorieOptions("income")` — the `kategorie` enum-multi filter is
 *     runtime-loaded; P2-04: its `value` is the kategorie NAME-SNAPSHOT string,
 *     so we map each KategorieOption → `{ value: name, label }`.
 *   - NO member picker — the Einnahmen registry has no member-picker field
 *     (X-PRAG-04), so we never call `listMemberOptions()` → `memberOptions: []`.
 *
 * Phase 5 (Tier C2): the rich KPI now comes from `listEinnahmenKpi` (the
 * C2-owned Sphären-Split aggregation, spec §8.1) and the Einnahmen columns
 * (🔗 badge, Sphäre left-rule, no status) live in `+page.svelte`. NO bulk
 * payload — Einnahmen has no bulk-select.
 */

import type { PageServerLoad } from "./$types.js";
import { loadEinnahmenListData } from "./list-load.js";

export const load: PageServerLoad = async ({ url, parent }) => {
  // The list shape is built by the shared loader (reused by the /neu Kulisse).
  const { yearScope, currentYear } = await parent();
  return loadEinnahmenListData({ url, yearScope, currentYear });
};
