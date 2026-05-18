/**
 * Root route redirect logic.
 *
 * - No session + PUBLIC_FORM_ENABLED=true  → /auslage-einreichen
 * - Session present                         → /app
 * - No session + PUBLIC_FORM_ENABLED=false  → /sign-in?reason=public-form-coming-soon
 */

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { env } from "$lib/server/env.js";
import { resolveSession } from "$lib/server/auth/index.js";

export const load: PageServerLoad = async ({ cookies }) => {
  const session = await resolveSession(cookies).catch(() => null);

  if (session) {
    throw redirect(302, "/app");
  }

  if (env.PUBLIC_FORM_ENABLED) {
    throw redirect(302, "/auslage-einreichen");
  }

  throw redirect(302, "/sign-in?reason=public-form-coming-soon");
};
