/**
 * Admin email allowlist (ADR-0009 §7.5).
 *
 * ADMIN_EMAILS env var: comma-separated list of raw emails.
 * Each is canonicalized at startup so comparisons are apples-to-apples.
 * isAdminEmail() receives the already-canonical email from the caller.
 */

import { canonicalizeEmail } from "$lib/domain/email.js";
import { env } from "$lib/server/env.js";

let _allowlist: Set<string> | null = null;

function getAdminAllowlist(): Set<string> {
  if (_allowlist !== null) return _allowlist;
  const raw = env.ADMIN_EMAILS;
  _allowlist = new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => canonicalizeEmail(e)),
  );
  return _allowlist;
}

/**
 * Returns true if `canonicalEmail` is in the admin allowlist.
 * Input MUST already be canonicalized (email.ts canonicalizeEmail).
 */
export function isAdminEmail(canonicalEmail: string): boolean {
  return getAdminAllowlist().has(canonicalEmail);
}
