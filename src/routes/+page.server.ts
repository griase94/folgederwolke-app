/**
 * Root route — role-aware entry point.
 *
 * - Session present                          → /app (admin home; member roles
 *                                               will branch to /portal later)
 * - No session + PUBLIC_FORM_ENABLED=true     → render the landing page so the
 *                                               visitor can choose between the
 *                                               public Auslage form and signing
 *                                               in. (Previously this silently
 *                                               redirected to the form, which
 *                                               trapped logged-out admins — they
 *                                               had no way to reach /sign-in.)
 * - No session + PUBLIC_FORM_ENABLED=false    → /sign-in (nothing public to show)
 *
 * For a returning external on the installed PWA, the landing page's client-side
 * sticky logic (see +page.svelte / pwa-entry.ts) fast-forwards to the form.
 */

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { isPublicFormEnabled } from "$lib/server/env.js";
import { resolveSession } from "$lib/server/auth/index.js";

export const load: PageServerLoad = async ({ cookies }) => {
  const session = await resolveSession(cookies).catch(() => null);

  if (session) {
    throw redirect(302, "/app");
  }

  if (!isPublicFormEnabled()) {
    throw redirect(302, "/sign-in?reason=public-form-coming-soon");
  }

  // Logged out + public form enabled → render the landing page.
  return {};
};
