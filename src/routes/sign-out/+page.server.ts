/**
 * /sign-out — deletes session row, clears cookie, writes audit_log entry.
 * MUST-fix #5.
 *
 * GET  — signs the current visitor out and redirects to /sign-in (idempotent).
 *        Previously this returned 500 because no +page.svelte existed; the
 *        Julia user-review (2026-05-19) caught it.
 * POST — same effect, plus the `everywhere` action to revoke all sessions.
 *
 * Both paths route through signOut() so the audit_log entry and the
 * server-side session row deletion are guaranteed before the redirect fires.
 */

import { redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { signOut, signOutEverywhere } from "$lib/server/auth/index.js";

export const load: ServerLoad = async ({
  cookies,
  locals,
  request,
  getClientAddress,
}) => {
  const userId = locals.session?.user.id ?? null;
  const ip = getClientAddress();
  const ua = request.headers.get("user-agent") ?? "";

  // Safe to call even when there's no active session — signOut() clears the
  // cookie defensively and skips the audit row when userId is null.
  await signOut(cookies, userId, { ip, ua });

  redirect(303, "/sign-in?reason=signed-out");
};

export const actions: Actions = {
  default: async ({ cookies, locals, request, getClientAddress }) => {
    const userId = locals.session?.user.id ?? null;
    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    await signOut(cookies, userId, { ip, ua });

    redirect(303, "/sign-in?reason=signed-out");
  },

  everywhere: async ({ cookies, locals, request, getClientAddress }) => {
    const userId = locals.session?.user.id;
    if (!userId) redirect(303, "/sign-in");

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    await signOutEverywhere(cookies, userId, { ip, ua });

    redirect(303, "/sign-in?reason=signed-out-everywhere");
  },
};
