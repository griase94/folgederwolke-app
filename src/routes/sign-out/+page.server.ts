/**
 * POST /sign-out — deletes session row, clears cookie, writes audit_log entry.
 * MUST-fix #5.
 *
 * Actions:
 *   default    — sign out current session only
 *   everywhere — revoke ALL sessions for this user (phase-7 polish)
 */

import { redirect, type Actions } from "@sveltejs/kit";
import { signOut, signOutEverywhere } from "$lib/server/auth/index.js";

export const actions: Actions = {
  default: async ({ cookies, locals, request, getClientAddress }) => {
    const userId = locals.session?.user.id ?? null;
    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    await signOut(cookies, userId, { ip, ua });

    redirect(303, "/sign-in");
  },

  everywhere: async ({ cookies, locals, request, getClientAddress }) => {
    const userId = locals.session?.user.id;
    if (!userId) redirect(303, "/sign-in");

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    await signOutEverywhere(cookies, userId, { ip, ua });

    redirect(303, "/sign-in");
  },
};
