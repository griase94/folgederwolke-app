/**
 * SvelteKit server hooks.
 *
 * handle: resolves session from cookie and attaches to event.locals.
 * Protects /app/* routes — redirects to /sign-in if unauthenticated.
 * Also sets security response headers on every response (HSTS, CSP, etc.).
 */

import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import { resolveSession } from "$lib/server/auth/index.js";

// ---------------------------------------------------------------------------
// Auth + session handle
// ---------------------------------------------------------------------------

const authHandle: Handle = async ({ event, resolve }) => {
  // Resolve session for every request (null if missing/expired)
  try {
    event.locals.session = await resolveSession(event.cookies);
  } catch {
    // DB unavailable or cookie parse error — treat as unauthenticated
    event.locals.session = null;
  }

  // Protect /app/* routes
  if (event.url.pathname.startsWith("/app")) {
    if (!event.locals.session) {
      redirect(
        303,
        `/sign-in?redirectTo=${encodeURIComponent(event.url.pathname)}`,
      );
    }
  }

  return resolve(event);
};

// ---------------------------------------------------------------------------
// Security headers handle
// ---------------------------------------------------------------------------

const securityHandle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // HSTS — 2 years, include subdomains, eligible for preload list
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME-type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Limit referrer information to same-origin requests
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable unused browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // Content Security Policy — baseline; tighten per-route as needed
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' blob: data: https://*.googleusercontent.com",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  );

  return response;
};

// ---------------------------------------------------------------------------
// Compose handles in order: auth first, then security headers
// ---------------------------------------------------------------------------

export const handle: Handle = sequence(authHandle, securityHandle);
