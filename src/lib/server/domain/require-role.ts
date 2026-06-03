/**
 * Role-guard helper for server actions (B2 fix, ADR-0009).
 *
 * Returns a 403 failure object if the given role is not in the allowed set,
 * or null if the caller is authorised. Pattern:
 *
 *   const denial = requireAdmin(actorRole);
 *   if (denial) return denial;
 */

import type { ActionFailure } from "./members-actions.js";

/**
 * Returns a 403 ActionFailure if `role` is not "admin", otherwise null.
 *
 * The "kassenwart" role is listed here as a future extension point — all
 * currently shipped mutations are admin-only (Phase 0 ADR-0009).
 */
export function requireAdmin(
  role: string | null | undefined,
): ActionFailure | null {
  if (role === "admin") return null;
  return { ok: false, status: 403, error: "Nur Admins." };
}
