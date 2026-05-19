/**
 * GET /api/cron/daily-dispatcher
 *
 * Vercel cron endpoint — runs daily (see vercel.json).
 * Umbrella job for routine cleanup and Drive-resilience tasks:
 *
 *   1. Delete expired magic_links (> 1 day past expires_at)
 *   2. Delete expired / stale sessions
 *   3. Delete old rate_limit_attempts (> 1 hour)
 *   4. Retry failed Drive uploads for invoices (best-effort, batch of 10)
 *   5. Verify audit_log hash chain (ADR-0004 Phase 7.5)
 *
 * Auth: CRON_SECRET header required (Vercel Authorization: Bearer <secret>).
 *
 * Returns JSON: { ok: true, results: {...} } on success.
 */

import type { RequestHandler } from "./$types.js";
import {
  cleanupMagicLinks,
  cleanupSessions,
  cleanupRateLimitAttempts,
  retryFailedDriveUploads,
  runAuditChainVerification,
} from "$lib/server/domain/cron-tasks.js";
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

  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  // 1. Cleanup magic_links
  try {
    results.magic_links_deleted = await cleanupMagicLinks();
  } catch (err) {
    errors.magic_links = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-dispatcher] magic_links cleanup failed:", err);
  }

  // 2. Cleanup sessions
  try {
    results.sessions_deleted = await cleanupSessions();
  } catch (err) {
    errors.sessions = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-dispatcher] sessions cleanup failed:", err);
  }

  // 3. Cleanup rate_limit_attempts
  try {
    results.rate_limit_deleted = await cleanupRateLimitAttempts();
  } catch (err) {
    errors.rate_limit = err instanceof Error ? err.message : String(err);
    console.error(
      "[cron/daily-dispatcher] rate_limit_attempts cleanup failed:",
      err,
    );
  }

  // 4. Drive-resilience retry (best-effort — never fails the whole cron)
  try {
    results.drive_retry = await retryFailedDriveUploads();
  } catch (err) {
    errors.drive_retry = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-dispatcher] drive retry failed:", err);
  }

  // 5. Audit-chain verification (ADR-0004). Chain breaks land as
  //    `errors.audit_chain` so the response shape signals an alert.
  try {
    const auditResult = await runAuditChainVerification();
    results.audit_chain = auditResult;
    if (!auditResult.ok) {
      errors.audit_chain = `audit chain broken: ${auditResult.breakCount} mismatch(es) detected (head=${auditResult.head})`;
    }
  } catch (err) {
    errors.audit_chain = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-dispatcher] audit chain verify failed:", err);
  }

  const hasErrors = Object.keys(errors).length > 0;
  console.info("[cron/daily-dispatcher]", { results, errors });

  return new Response(
    JSON.stringify({
      ok: !hasErrors,
      results,
      errors: hasErrors ? errors : undefined,
    }),
    {
      status: hasErrors ? 207 : 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
};
