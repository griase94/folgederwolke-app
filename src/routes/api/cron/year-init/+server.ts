/**
 * GET /api/cron/year-init
 *
 * Vercel cron endpoint — runs on Jan 1 (Dec 31 23:05 UTC = Jan 1 00:05 CET).
 * Materializes member_beitrags rows for all active members for the current
 * Berlin year. Idempotent: safe to invoke multiple times.
 *
 * **Method: GET** — Vercel cron sends GET requests (not POST). Mirrors the
 * existing pattern in src/routes/api/cron/beitragsreminder/+server.ts.
 * (plan P0-C1 fix)
 *
 * Auth: CRON_SECRET bearer token required.
 */

import type { RequestHandler } from "./$types.js";
import { materializeYearRows } from "$lib/server/domain/year-row-materializer.js";
import { berlinYear } from "$lib/domain/year.js";
import { env } from "$lib/server/env.js";

function isCronAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

export const GET: RequestHandler = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const year = berlinYear();

  try {
    const created = await materializeYearRows(year);

    console.info("[cron/year-init]", { year, created });

    return new Response(JSON.stringify({ ok: true, year, created }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/year-init] Fatal error:", err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
