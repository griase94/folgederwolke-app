/**
 * /app/jahresabschluss — Hub. The .ycard year stack (D-Flow §4.1): per-year
 * sums (3-source EÜR union) + counts + Buchungszahl + closed state, plus the
 * abschlussbereite Jahr's full pre-flight checklist. `years[].year`/`.closed`
 * stay for the current screen; S3 consumes the richer card shape.
 */

import type { PageServerLoad } from "./$types.js";
import { loadJahresabschlussHub } from "$lib/server/eur/hub.js";

export const load: PageServerLoad = async () => {
  return await loadJahresabschlussHub();
};
