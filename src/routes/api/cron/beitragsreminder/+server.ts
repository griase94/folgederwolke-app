/**
 * GET /api/cron/beitragsreminder
 *
 * Vercel cron endpoint — runs once a year (see vercel.json).
 * Finds members with unpaid Beiträge for the current year and sends a
 * BeitragsReminder mail to each. Mail dedup via sent_mails UNIQUE constraint
 * ensures idempotency: running the cron twice in one year is safe.
 *
 * Auth: CRON_SECRET header required (or Vercel's built-in Authorization header).
 *
 * Returns JSON: { ok: true, result: BeitragsreminderResult } on success.
 */

import type { RequestHandler } from "./$types.js";
import { dispatchBeitragsreminder } from "$lib/server/domain/cron-tasks.js";
import { env } from "$lib/server/env.js";

function isCronAuthorized(request: Request): boolean {
  // Vercel sets Authorization: Bearer <CRON_SECRET> for cron requests.
  const authHeader = request.headers.get("authorization");
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    // No secret configured — reject all cron requests in production.
    return false;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

export const GET: RequestHandler = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const result = await dispatchBeitragsreminder({
      // These bank details mirror the existing member detail page implementation.
      // In a future phase, read from settings table (verein.iban etc.).
      iban: env.VEREIN_IBAN || "DE25830654080006894453",
      bic: env.VEREIN_BIC || "BELADEBEXXX",
      bank: env.VEREIN_BANK || "Berliner Volksbank",
      empfaenger: env.VEREIN_NAME || "Folge der Wolke e.V.",
    });

    console.info("[cron/beitragsreminder]", result);

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/beitragsreminder] Fatal error:", err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
