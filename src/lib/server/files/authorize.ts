import type { files as FilesTable } from "$lib/server/db/schema/files.js";

type FileRow = typeof FilesTable.$inferSelect;

// SessionUser shape: from $lib/server/auth (id, email, emailCanonical, name, role).
// We only need to verify presence — resolveSession() already deletes sessions
// for non-admin users (auth/index.ts:357), so if user is non-null, they're
// either admin or steuerberater (both in ADMIN_EMAILS allowlist).
interface SessionUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Phase 9 authz: if you have a session (resolved by hooks.server.ts), you're
 * already on ADMIN_EMAILS — resolveSession deletes sessions for non-admins on
 * every request. So the only file-level check needed is soft-delete state.
 *
 * When Phase 10+ adds magic-link member self-service viewing (no real session,
 * just an emailed link), this function will need a per-file ownership check.
 */
export async function authorizeFileAccess(
  user: SessionUser,
  file: FileRow,
): Promise<AuthDecision> {
  if (file.deletedAt) {
    return { allowed: false, reason: "file_soft_deleted" };
  }
  return { allowed: true, reason: "authenticated_user" };
}
