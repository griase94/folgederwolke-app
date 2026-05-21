/**
 * Phase 9 Task 14 — /app/files/papierkorb (admin-only).
 *
 * Lists soft-deleted files (deleted_at IS NOT NULL) and exposes Restore.
 * Restore goes through restoreFile() which guards against sha256 conflicts
 * with active rows (a newer copy of the same Beleg).
 *
 * Authorization: hooks.server.ts already redirects unauthenticated requests.
 * /app/* is only reachable by admin/steuerberater per resolveSession.
 */
import type { PageServerLoad, Actions } from "./$types.js";
import { redirect, fail } from "@sveltejs/kit";
import { getDb } from "$lib/server/db/index.js";
import {
  restoreFile,
  FestschreibungLockedError,
} from "$lib/server/files/restore.js";
import { sql } from "drizzle-orm";

interface TrashRow {
  id: string;
  original_filename: string;
  mime_type: string;
  deleted_at: string;
  delete_reason: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.session?.user) throw redirect(302, "/anmelden");

  const r = (await getDb().execute(sql`
    SELECT id, original_filename, mime_type, deleted_at, delete_reason
    FROM files
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `)) as unknown as TrashRow[];
  return { rows: r };
};

export const actions: Actions = {
  restore: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Not authenticated" });
    const fd = await request.formData();
    const fileId = fd.get("fileId")?.toString();
    if (!fileId) return fail(400, { error: "Missing fileId" });
    try {
      await restoreFile(fileId, user.id);
      return { success: true };
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Wiederherstellung fehlgeschlagen";
      // Festschreibung-locked is conceptually 409 too; we treat both alike,
      // but keeping the branch explicit makes future telemetry / log
      // separation trivial.
      if (e instanceof FestschreibungLockedError) {
        return fail(409, { error: msg });
      }
      return fail(409, { error: msg });
    }
  },
};
