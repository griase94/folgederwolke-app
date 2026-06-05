/**
 * E2E regression tests for the prod 500s captured in the Vercel log export on
 * 2026-05-20 (`folgederwolke-app-log-export-2026-05-20T13-42-33.csv`).
 *
 * Two bug groups were fixed:
 *
 *  A) SvelteKit forbids mixing a `default:` action with named actions on the
 *     same route. Six routes were doing this and 500'd at runtime. We renamed
 *     the default action to a meaningful name (signout / add / create) and
 *     updated every consumer form to call the named action explicitly.
 *
 *  B) `expenses_business_id_format_ck` enforced `^A-…` but the audit-inbox
 *     approve flow inserts AUS-prefixed business_ids carried over from the
 *     submission. We relaxed the constraint and fixed the direct-entry
 *     allocator (transactions/neu) to use the `A-` prefix instead of `AUS-`.
 *
 * These tests are intentionally tagged @phase-2 so they run under the current
 * CI grep (@phase-0|@phase-1|@phase-2). The existing per-phase E2E coverage
 * for these flows already exists but is gated behind @phase-3+, so it didn't
 * catch the regression — see CLAUDE.md "Testing → Tags + CI grep". When CI
 * starts running @phase-3+ tests, this file can be retired.
 */

import { expect, test } from "@playwright/test";

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// Bug A — every renamed action returns a non-500 response when invoked
// ---------------------------------------------------------------------------
//
// We POST to each route without a session. The expected behaviour is a 303
// redirect to /sign-in (for protected routes) or to /sign-in?reason=… (for
// sign-out). Crucially we assert the response is NOT a 500 — that proves
// the SvelteKit `check_named_default_separate` runtime error is gone.
//
// We POST with `form: {}` so the request is a "form-style" POST (not the
// fetch-based JSON variant SvelteKit uses for `use:enhance`). This mirrors
// the actual production failure surface: a real <form> submission.

test.describe("@phase-2 prod-bug-regressions — renamed default actions", () => {
  const renamed: Array<{ route: string; namedAction: string }> = [
    { route: "/sign-out", namedAction: "signout" },
    { route: "/app/mitglieder", namedAction: "add" },
    { route: "/app/rechnungen/new", namedAction: "create" },
    { route: "/app/kunden", namedAction: "add" },
    { route: "/app/projekte", namedAction: "add" },
    // Phase 8 T6: /app/transactions/spenden retired (404s) — removed from this regression check.
  ];

  for (const { route, namedAction } of renamed) {
    test(`POST ${route}?/${namedAction} does not 500`, async ({ page }) => {
      const response = await page.request.post(`${route}?/${namedAction}`, {
        form: {},
        // Don't follow redirects automatically — we want the raw status of
        // the action itself, not the followed /sign-in page.
        maxRedirects: 0,
      });
      // 200/303/4xx are all acceptable; 500 is the regression we're guarding.
      expect(
        response.status(),
        `${route}?/${namedAction} returned 500 — named/default action conflict has regressed`,
      ).not.toBe(500);
      // We also accept the 200/303 family — the action ran, even if it
      // rejected the unauthenticated request.
      expect(response.status()).toBeLessThan(500);
    });
  }
});

// ---------------------------------------------------------------------------
// Bug A (defensive) — the OLD `?/default` POST shape returns a clean 4xx,
// not a 500. SvelteKit raises `check_named_default_separate` when the route
// has named actions and the request asks for the default — we need to be
// certain that error is no longer raised because the route no longer has a
// `default` key.
// ---------------------------------------------------------------------------

test.describe("@phase-2 prod-bug-regressions — old ?/default returns 4xx", () => {
  const oldShape = [
    "/sign-out",
    "/app/mitglieder",
    "/app/rechnungen/new",
    "/app/kunden",
    "/app/projekte",
    // Phase 8 T6: /app/transactions/spenden retired (404s) — removed from this regression check.
  ];

  for (const route of oldShape) {
    test(`POST ${route}?/default no longer 500s`, async ({ page }) => {
      const response = await page.request.post(`${route}?/default`, {
        form: {},
        maxRedirects: 0,
      });
      // The action no longer exists, so SvelteKit returns 404 or similar.
      // The point: it must NOT be 500 (which was the prod symptom).
      expect(
        response.status(),
        `${route}?/default returned 500 — check_named_default_separate has regressed`,
      ).not.toBe(500);
    });
  }
});

// ---------------------------------------------------------------------------
// Bug B — /app/transactions/neu retired (Phase 8 T6).
// The constraint regression is now tested via the per-tab create routes
// (ausgaben/neu, einnahmen/neu, spenden/neu). This smoke check is removed.
// ---------------------------------------------------------------------------
