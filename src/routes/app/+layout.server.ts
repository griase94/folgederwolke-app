/**
 * /app layout server load — passes the authenticated user to all /app/* pages.
 * Route protection is handled in hooks.server.ts (redirect to /sign-in if null).
 */

import type { LayoutServerLoad } from "./$types.js";

export const load: LayoutServerLoad = ({ locals }) => {
  // locals.session is guaranteed non-null here because hooks.server.ts
  // redirects unauthenticated requests before this runs.
  return {
    user: locals.session!.user,
  };
};
