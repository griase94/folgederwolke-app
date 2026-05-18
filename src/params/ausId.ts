/**
 * SvelteKit route param matcher for AUS-{YYYY}-{NNN} business IDs.
 *
 * CURRENTLY UNUSED — the route folder is named `[ausId]` (no matcher suffix),
 * so this matcher is not applied at the routing layer. The active guard is the
 * inline `parseBusinessId()` call in `+page.server.ts:load()`.
 *
 * TODO Phase 2 backlog #20: rename the route folder to `[ausId=ausId]` to
 * apply this matcher declaratively and remove the inline guard. Until then,
 * keep this file so the pattern is documented and ready to activate.
 */

import type { ParamMatcher } from "@sveltejs/kit";

export const match: ParamMatcher = (param) => /^AUS-\d{4}-\d{3,}$/.test(param);
