/**
 * Cookie helpers for session + magic_link_intent.
 *
 * Both cookies: HttpOnly, Secure, SameSite=Lax, signed with SESSION_SECRET.
 * HMAC-SHA256 signature appended as `.{hex}` — verified with timingSafeEqual.
 */

import type { Cookies } from "@sveltejs/kit";
import { env } from "$lib/server/env.js";
import {
  sign as signWithSecret,
  unsign as unsignWithSecret,
} from "./cookie-sign.js";
import { INTENT_COOKIE_NAME, SESSION_COOKIE_NAME } from "./cookie-names.js";

export { SESSION_COOKIE_NAME } from "./cookie-names.js";

const SESSION_COOKIE = SESSION_COOKIE_NAME;
const INTENT_COOKIE = INTENT_COOKIE_NAME;

// ---------------------------------------------------------------------------
// HMAC signing — see cookie-sign.ts for implementation
// ---------------------------------------------------------------------------

function sign(value: string): string {
  return signWithSecret(value, env.SESSION_SECRET);
}

/** Verify HMAC signature. Returns the original value, or null on tamper. */
export function unsign(signed: string): string | null {
  return unsignWithSecret(signed, env.SESSION_SECRET);
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export function setSessionCookie(cookies: Cookies, rawToken: string): void {
  cookies.set(SESSION_COOKIE, sign(rawToken), {
    path: "/",
    httpOnly: true,
    // Secure required for production HTTPS. Disable when running over plain http
    // (local preview, Playwright e2e) — otherwise the browser silently drops the
    // cookie and downstream auth fails.
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
  });
}

export function getSessionToken(cookies: Cookies): string | null {
  const signed = cookies.get(SESSION_COOKIE);
  if (!signed) return null;
  return unsign(signed);
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

// ---------------------------------------------------------------------------
// Magic-link intent cookie (device binding)
// ---------------------------------------------------------------------------

const INTENT_MAX_AGE = 15 * 60; // 15 minutes in seconds

/** Value stored in the intent cookie is the signed tokenHash. */
export function setIntentCookie(cookies: Cookies, tokenHash: string): void {
  cookies.set(INTENT_COOKIE, sign(tokenHash), {
    path: "/",
    httpOnly: true,
    // Secure required for production HTTPS. Disable when running over plain http
    // (local preview, Playwright e2e) — otherwise the browser silently drops the
    // cookie and downstream auth fails.
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: INTENT_MAX_AGE,
  });
}

/**
 * Verify the intent cookie matches the expected tokenHash.
 * Returns true (match), false (mismatch — different device), null (no cookie).
 */
export function checkIntentCookie(
  cookies: Cookies,
  tokenHash: string,
): boolean | null {
  const signed = cookies.get(INTENT_COOKIE);
  if (!signed) return null;
  const value = unsign(signed);
  if (value === null) return false;
  return value === tokenHash;
}

export function clearIntentCookie(cookies: Cookies): void {
  cookies.delete(INTENT_COOKIE, { path: "/" });
}
