/**
 * /app/spenden — flat Spenden (donation) list route (Phase 6, Task 2).
 *
 * Thin `load`: parse the Phase-2 filter state, read the layout year scope, clamp
 * the `?page` into range, then call `listSpendenPage` + the C3-owned
 * `listSpendenKpi` + the picker-option loaders the Spenden FILTER_REGISTRY needs:
 *
 *   - NO kategorie filter — the Spenden registry has no `kategorie` field
 *     (X-PRAG-04, §9.1), so we never call `listKategorieOptions()` →
 *     `kategorieOptions: []`.
 *   - `listMemberOptions()` — the `spender` field IS a member-picker, so the
 *     scaffold's member-picker dropdown needs the member options.
 *
 * `listSpendenKpi(year)` powers the §9.1 KPI strip: total + count + the
 * disappearing "N ohne Bescheinigung" pill + "M Bescheinigungen versandt".
 */

import type { PageServerLoad } from "./$types.js";
import { loadSpendenListData } from "./list-load.js";

export const load: PageServerLoad = async ({ url, parent }) => {
  // The list shape is built by the shared loader (reused by the /neu Kulisse).
  const { yearScope, currentYear } = await parent();
  return loadSpendenListData({ url, yearScope, currentYear });
};
