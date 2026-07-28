/**
 * Root route — role-aware entry point.
 *
 * - Session present (admin)                   → /app (admin home)
 * - Session present (member_self_service)     → /portal (member home)
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

export const load: PageServerLoad = async ({ locals }) => {
  // hooks.server.ts already called resolveSession and populated locals.session
  // for this same request — read it here instead of making a second DB
  // round-trip (PR1 latency optimisation).
  if (locals.session) {
    // Role-aware landing: self-service members go to their portal; admins (incl.
    // admins who are also members) go to the app and can navigate to /portal.
    throw redirect(
      302,
      locals.session.user.role === "member_self_service" ? "/portal" : "/app",
    );
  }

  if (!isPublicFormEnabled()) {
    throw redirect(302, "/sign-in?reason=public-form-coming-soon");
  }

  // Logged out + public form enabled → render the landing page.
  return {};
};
