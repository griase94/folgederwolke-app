/**
 * Root layout server load.
 *
 * Passes PUBLIC_FORM_ENABLED to the layout so it can inject a
 * <meta name="robots" content="noindex,nofollow" /> when the public form
 * is disabled — preventing search-engine indexing of a not-yet-launched site.
 *
 * Also exposes the runtime `vereinName` (settings → env fallback via
 * readStammdaten) so every page can thread `$page.data.vereinName` into chrome,
 * page titles, and payer labels instead of a hardcoded "Folge der Wolke"
 * literal (white-label Phase 1). This adds one indexed `settings` read per
 * request; if a future profiling pass flags it, memoize per-request in locals.
 */

import type { LayoutServerLoad } from "./$types.js";
import { isPublicFormEnabled } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";

export const load: LayoutServerLoad = async () => {
  const stammdaten = await readStammdaten();
  return {
    publicFormEnabled: isPublicFormEnabled(),
    vereinName: stammdaten.name,
  };
};
