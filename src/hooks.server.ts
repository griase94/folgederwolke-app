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
import { registerHandlers } from "$lib/server/events/index.js";
import { assertProductionEnvSafe } from "$lib/server/env.js";

// ---------------------------------------------------------------------------
// One-time startup safety checks
// ---------------------------------------------------------------------------
// In production: throws if SESSION_SECRET is missing/short or PUBLIC_BASE_URL
// is unset — both would render auth insecure. See env.ts for the full list.
// In dev: logs a warning and continues so local development isn't blocked.
assertProductionEnvSafe();

// ---------------------------------------------------------------------------
// One-time event-handler registration (§4.1.1 #2)
// ---------------------------------------------------------------------------
// Module-load side effect. SvelteKit imports hooks.server.ts exactly once per
// server boot, so handlers are registered before any request is served.
// `registerHandlers()` is idempotent (module-level guard) — safe to import in
// tests too.
registerHandlers();

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

  // Protect /app and /app/* routes. Use exact-match-plus-slash rather than
  // `startsWith("/app")` so paths like `/appendix`, `/app-onboarding` or
  // `/applepay` are not accidentally caught by the auth gate.
  if (event.url.pathname === "/app" || event.url.pathname.startsWith("/app/")) {
    if (!event.locals.session) {
      // PM-007: an Externe who installs the PWA from /auslage-einreichen
      // will have start_url=/app?source=pwa (per manifest.webmanifest).
      // Without this branch they'd land on /sign-in?redirectTo=/app and
      // be stuck — they have no admin credentials. Redirect them straight
      // back to the public form instead. Authed admins on the same flow
      // never hit this branch because event.locals.session is truthy.
      if (event.url.searchParams.get("source") === "pwa") {
        redirect(303, "/auslage-einreichen?source=pwa");
      }
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

  // Disable unused browser features (including privacy-invasive APIs)
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  );

  // Content-Security-Policy is now configured via svelte.config.js kit.csp
  // (mode: 'auto'), which adds nonces/hashes for SvelteKit's own inline
  // hydration scripts. Setting the header manually here would override
  // SvelteKit's emission and block hydration.

  return response;
};

// ---------------------------------------------------------------------------
// Compose handles in order: auth first, then security headers
// ---------------------------------------------------------------------------

export const handle: Handle = sequence(authHandle, securityHandle);
