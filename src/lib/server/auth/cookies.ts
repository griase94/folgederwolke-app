/**
 * Cookie helpers for session + magic_link_intent.
 *
 * Both cookies: HttpOnly, Secure, SameSite=Lax, signed with SESSION_SECRET.
 * HMAC-SHA256 signature appended as `.{hex}` — verified with timingSafeEqual.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import { env } from "$lib/server/env.js";

const SESSION_COOKIE = "session";
const INTENT_COOKIE = "magic_link_intent";

// ---------------------------------------------------------------------------
// HMAC signing
// ---------------------------------------------------------------------------

function sign(value: string): string {
  const sig = createHmac("sha256", env.SESSION_SECRET)
    .update(value)
    .digest("hex");
  return `${value}.${sig}`;
}

/** Verify HMAC signature. Returns the original value, or null on tamper. */
export function unsign(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return null;
  const value = signed.slice(0, lastDot);
  const expected = sign(value);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signed, "utf8");
    if (a.length !== b.length) {
      // Lengths differ — can't timingSafeEqual; leak no timing info via fallback.
      // Still do the comparison on equal-length buffers to avoid timing-oracle
      // but return null regardless.
      timingSafeEqual(Buffer.alloc(a.length), Buffer.alloc(a.length));
      return null;
    }
    if (!timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
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
