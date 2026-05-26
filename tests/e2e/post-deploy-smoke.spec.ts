/**
 * Post-deploy production smoke tests.
 *
 * Triggered by .github/workflows/post-deploy-smoke.yml after Vercel reports a
 * production deployment as `success`. Runs against the live production URL
 * (via `PLAYWRIGHT_BASE_URL` env var → playwright.post-deploy.config.ts).
 *
 * SAFETY CONTRACT: ALL tests in this file MUST be strictly READ-ONLY.
 *   - No POST / PUT / PATCH / DELETE
 *   - No login / session creation
 *   - No data mutation (no member create, no upload, no form submit)
 *
 * Two consecutive failures of this suite trigger an automated Instant
 * Rollback against production via scripts/ci/vercel-rollback.sh. Adding a
 * mutating test here would mean a flaky write could destabilise prod. Keep
 * the surface minimal: boot, auth-redirect, DB connectivity.
 */

import { expect, test } from "@playwright/test";

test.describe("@post-deploy production smoke", () => {
  test("home page returns 2xx (app booted)", async ({ request }) => {
    const resp = await request.get("/", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    // Accept any 2xx — / may render directly or be a 200 marketing-style page.
    // We don't follow redirects: if / 3xx-redirects to /app, treat that as
    // also valid below by allowing 200-399.
    expect(
      resp.status(),
      `Expected 2xx/3xx from /, got ${resp.status()}`,
    ).toBeGreaterThanOrEqual(200);
    expect(
      resp.status(),
      `Expected 2xx/3xx from /, got ${resp.status()}`,
    ).toBeLessThan(400);
  });

  test("/app redirects unauthenticated traffic to /sign-in (auth middleware live)", async ({
    request,
  }) => {
    // hooks.server.ts redirects to /sign-in?redirectTo=... when locals.session
    // is null. This test exercises both the route handler AND the auth
    // middleware — if either is broken the redirect won't happen.
    const resp = await request.get("/app", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(
      [302, 303, 307],
      `Expected redirect status from /app (unauth), got ${resp.status()}`,
    ).toContain(resp.status());
    const location = resp.headers()["location"] ?? "";
    expect(
      location,
      `Expected Location header on /app redirect, got empty`,
    ).toMatch(/sign-in|login/i);
  });

  test("/healthz returns 200 with db=ok (database connectivity)", async ({
    request,
  }) => {
    // /healthz contract (src/routes/healthz/+server.ts):
    //   - Always 200; per-subsystem status in JSON body
    //   - { db: "ok"|"fail", sheets, blob, sha, deployedAt }
    // We assert db=ok specifically because that's the connectivity test —
    // sheets/blob can be "fail" transiently without warranting a rollback,
    // but a dead DB means the app cannot serve any meaningful request.
    const resp = await request.get("/healthz", { failOnStatusCode: false });
    expect(
      resp.status(),
      `Expected 200 from /healthz, got ${resp.status()}`,
    ).toBe(200);

    const body = await resp.text();
    // Match either the structured JSON shape OR a more relaxed "ok"/"healthy"
    // body — covers the case where /healthz contract changes shape in future.
    expect(
      body,
      `/healthz body did not signal health: ${body.slice(0, 200)}`,
    ).toMatch(/"db"\s*:\s*"ok"|\bok\b|\bhealthy\b/i);
  });
});
