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

  // Bank details come exclusively from env.VEREIN_* — no string-literal
  // fallbacks. Mismatched IBAN/BIC fallbacks were the root cause of the
  // cycle-2 review finding F2 (Sparkasse Mittelthüringen IBAN paired with
  // a completely unrelated BIC). Empty env → empty payload → EPC builder
  // refuses to emit a v001 payload without BIC (F1), which is the right
  // failure mode: a misconfigured env should not silently send wrong data.
  if (!env.VEREIN_IBAN || !env.VEREIN_BIC) {
    console.error(
      "[cron/beitragsreminder] VEREIN_IBAN/VEREIN_BIC unset — refusing to dispatch reminders with no bank data.",
    );
    return new Response(
      JSON.stringify({
        ok: false,
        error: "VEREIN_IBAN or VEREIN_BIC env vars are unset",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const result = await dispatchBeitragsreminder({
      iban: env.VEREIN_IBAN,
      bic: env.VEREIN_BIC,
      bank: env.VEREIN_BANK,
      empfaenger: env.VEREIN_NAME,
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
