/**
 * SvelteKit route param matcher for AUS-{YYYY}-{NNN} business IDs.
 *
 * Use as `/auslage-status/[ausId=ausId]` once routes are renamed; until then
 * `parseBusinessId()` is the inline guard.
 */

import type { ParamMatcher } from "@sveltejs/kit";

export const match: ParamMatcher = (param) => /^AUS-\d{4}-\d{3,}$/.test(param);
