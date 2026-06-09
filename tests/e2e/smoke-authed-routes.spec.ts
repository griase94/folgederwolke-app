import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Authenticated-route smoke. Every primary /app section must render without a
 * 5xx for a signed-in admin. This is the net for SERVER-SIDE route crashes on
 * the authenticated surface — a `load()` throwing, an env misconfig, or a
 * read-time schema mismatch (the /app/mitglieder 500 from the migration-skip
 * incident was exactly this shape). The phase-tagged specs cover these routes
 * individually but under tags (@phase-4/5/6) NOT in the cumulative CI grep, so
 * a regression on, say, the dashboard could land unseen. One @smoke spec in
 * the grep closes that gap.
 *
 * NOTE: this does NOT catch a migration being SKIPPED — CI applies every
 * migration to a fresh DB regardless of journal ordering, so the schema is
 * always complete here. The skip class is guarded DB-free by
 * tests/unit/migration-journal-integrity.test.ts and at runtime by the
 * /healthz `migrations` canary.
 */

const ROUTES = [
  "/app", // dashboard
  "/app/mitglieder",
  "/app/transactions",
  "/app/rechnungen",
  "/app/inbox",
  "/app/projekte",
  "/app/jahresabschluss",
  "/app/kunden",
  "/app/einstellungen",
];

test.describe("@smoke authenticated app routes", () => {
  test("every primary /app section returns < 500 for an admin", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    // Positive auth assertion: loginAs must have produced an authenticated
    // session on /app. Without this, a regressed auth path would silently
    // redirect every /app route to /sign-in (which returns 200 < 500) and this
    // smoke would FALSE-PASS while testing the login page instead of the app.
    await expect(page).toHaveURL(/\/app(\/|$|\?)/);

    const failures: string[] = [];
    for (const route of ROUTES) {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      const status = res?.status() ?? 0;
      const landed = page.url();
      // Fail on the 5xx server-crash class (what this smoke exists to catch).
      // Tolerate 3xx/4xx so the check is robust to redirects/guards — EXCEPT a
      // bounce to /sign-in, which means we lost the session (auth regression),
      // not that the route is healthy.
      if (status === 0 || status >= 500) {
        failures.push(`${route} → ${status || "no response"}`);
      } else if (/\/sign-in/.test(landed)) {
        failures.push(
          `${route} → redirected to ${landed} (session lost — not authenticated)`,
        );
      }
    }

    expect(
      failures,
      `authenticated routes failing (5xx / no response / bounced to sign-in): ${failures.join(", ")}`,
    ).toEqual([]);
  });
});
