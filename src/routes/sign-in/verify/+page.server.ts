/**
 * GET  /sign-in/verify?token=… — click-through page (D13 / MUST-fix #6).
 *      Renders "Continue as {email}" with a hidden POST form. Does NOT consume.
 * POST /sign-in/verify — atomically consumes the magic link and creates a session.
 */

import { error, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import {
  checkIntentCookie,
  consumeMagicLink,
  getMagicLinkByToken,
} from "$lib/server/auth/index.js";

export const load: PageServerLoad = async ({ url, cookies }) => {
  const token = url.searchParams.get("token");
  if (!token) error(400, "TOKEN_MISSING");

  const link = await getMagicLinkByToken(token);
  if (!link) error(400, "LINK_INVALID_OR_EXPIRED");

  // Device-binding check (MUST-fix #7) — mismatch is a warning, not a hard block
  const { sha256 } = await import("$lib/server/auth/hash.js");
  const tokenHash = sha256(token);
  const intentMatch = checkIntentCookie(cookies, tokenHash);

  return {
    email: link.emailCanonical,
    token,
    // null = no cookie (e.g. different browser); false = tampered/mismatched
    deviceMismatch: intentMatch === false || intentMatch === null,
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const data = await request.formData();
    const token = (data.get("token") as string | null) ?? "";

    if (!token) error(400, "TOKEN_MISSING");

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    const result = await consumeMagicLink(token, { ip, ua }, cookies);

    if (!result.ok) {
      if (result.reason === "NOT_ADMIN") {
        error(403, "NOT_AUTHORISED");
      }
      error(400, "LINK_INVALID_OR_EXPIRED");
    }

    redirect(303, "/app");
  },
};
