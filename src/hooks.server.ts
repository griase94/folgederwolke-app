/**
 * SvelteKit server hooks.
 *
 * handle: resolves session from cookie and attaches to event.locals.
 * Protects /app/* routes — redirects to /sign-in if unauthenticated.
 */

import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { resolveSession } from "$lib/server/auth/index.js";

export const handle: Handle = async ({ event, resolve }) => {
  // Resolve session for every request (null if missing/expired)
  try {
    event.locals.session = await resolveSession(event.cookies);
  } catch {
    // DB unavailable or cookie parse error — treat as unauthenticated
    event.locals.session = null;
  }

  // Protect /app/* routes
  if (event.url.pathname.startsWith("/app")) {
    if (!event.locals.session) {
      redirect(
        303,
        `/sign-in?redirectTo=${encodeURIComponent(event.url.pathname)}`,
      );
    }
  }

  return resolve(event);
};
