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
import { building } from "$app/environment";
import { resolveThemeId, THEME_COOKIE } from "$lib/themes/index.js";

// ---------------------------------------------------------------------------
// One-time startup safety checks
// ---------------------------------------------------------------------------
// In production: throws if SESSION_SECRET is missing/short or PUBLIC_BASE_URL
// is unset — both would render auth insecure. See env.ts for the full list.
// In dev: logs a warning and continues so local development isn't blocked.
// Skipped during `building` (prerender): the build is not serving traffic, and
// prerendered pages (e.g. the legal pages) must not require the full prod env at
// build time. The check still runs at runtime on the first server request.
if (!building) assertProductionEnvSafe();

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
      // The PWA start_url is now `/?source=pwa` (the role-aware root), so a
      // fresh logged-out launch never reaches `/app` here. This branch only
      // catches STALE installs whose cached start_url is still
      // `/app?source=pwa`: route them through the role-aware landing (`/`)
      // rather than dumping them on the public form. The landing then offers
      // both "Anmelden" and "Auslage einreichen" (and fast-forwards a returning
      // external to the form via the sticky preference), so no audience —
      // including a logged-out admin — is trapped.
      if (event.url.searchParams.get("source") === "pwa") {
        redirect(303, "/?source=pwa");
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
// Theme handle — swaps <html data-theme="…"> per the fdw_theme cookie
// ---------------------------------------------------------------------------
// app.html carries data-theme="aurora" as the static fallback. The cookie
// value is validated against the theme registry (resolveThemeId returns
// DEFAULT_THEME for unknown values), so the substituted string is always one
// of our registry literals — no injection surface.
//
// NOTE (spec §3): PRERENDERED pages (/impressum, /datenschutz) are baked at
// build time and always render the static default theme. Acceptable while
// there is a single theme; recorded here so theme #2 doesn't surprise.
const themeHandle: Handle = async ({ event, resolve }) => {
  const theme = resolveThemeId(event.cookies.get(THEME_COOKIE));
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace('data-theme="aurora"', `data-theme="${theme}"`),
  });
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

export const handle: Handle = sequence(authHandle, themeHandle, securityHandle);
