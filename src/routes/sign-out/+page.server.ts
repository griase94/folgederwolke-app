/**
 * POST /sign-out — deletes session row, clears cookie, writes audit_log entry.
 * MUST-fix #5.
 */

import { redirect, type Actions } from "@sveltejs/kit";
import { signOut } from "$lib/server/auth/index.js";

export const actions: Actions = {
  default: async ({ cookies, locals, request, getClientAddress }) => {
    const userId = locals.session?.user.id ?? null;
    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    await signOut(cookies, userId, { ip, ua });

    redirect(303, "/sign-in");
  },
};
