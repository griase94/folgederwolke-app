/**
 * Root layout server load.
 *
 * Passes PUBLIC_FORM_ENABLED to the layout so it can inject a
 * <meta name="robots" content="noindex,nofollow" /> when the public form
 * is disabled — preventing search-engine indexing of a not-yet-launched site.
 */

import type { LayoutServerLoad } from "./$types.js";
import { isPublicFormEnabled } from "$lib/server/env.js";

export const load: LayoutServerLoad = () => {
  return {
    publicFormEnabled: isPublicFormEnabled(),
  };
};
