/**
 * POST /sign-in — issues a magic link (or no-ops for non-admin emails).
 * Always returns { ok: true, message: "Check your inbox 💌" } (anti-enumeration).
 */

import { fail, type Actions } from "@sveltejs/kit";
import { issueMagicLink, RateLimitError } from "$lib/server/auth/index.js";

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const data = await request.formData();
    const email = (data.get("email") as string | null)?.trim() ?? "";

    if (!email || !email.includes("@")) {
      return fail(400, {
        error: "Bitte eine gültige E-Mail-Adresse eingeben.",
      });
    }

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    try {
      await issueMagicLink(email, { ip, ua }, cookies);
    } catch (err) {
      if (err instanceof RateLimitError) {
        // Still return identical message — don't reveal rate-limiting to caller
        return { ok: true, message: "Check your inbox 💌" };
      }
      // Unexpected error — log but still return generic message
      console.error("[sign-in] issueMagicLink error:", err);
    }

    return { ok: true, message: "Check your inbox 💌" };
  },
};
