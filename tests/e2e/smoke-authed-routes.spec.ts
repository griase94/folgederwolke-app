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

    const failures: string[] = [];
    for (const route of ROUTES) {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      const status = res?.status() ?? 0;
      // < 500 (and a real response) is "not crashed". We deliberately tolerate
      // 3xx/4xx so the check is robust to redirects/guards and only fails on
      // the 5xx server-crash class this smoke exists to catch.
      if (status === 0 || status >= 500) {
        failures.push(`${route} → ${status || "no response"}`);
      }
    }

    expect(
      failures,
      `authenticated routes returning 5xx / no response: ${failures.join(", ")}`,
    ).toEqual([]);
  });
});
