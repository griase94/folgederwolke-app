/**
 * Phase 9 Task 14 — soft-deleted file restore.
 *
 * The `files.sha256` partial unique index (`WHERE deleted_at IS NULL`) means
 * at most one active row may exist per content hash. When a user soft-deletes
 * a Beleg and later re-uploads the same bytes, the new upload becomes the
 * active row. Restoring the old row would violate the partial unique index,
 * so we refuse with a German-language error the admin UI can surface.
 *
 * Restoring an already-active row is a no-op (idempotent).
 */
import { eq, and, isNull, ne } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";

export async function restoreFile(fileId: string): Promise<void> {
  const db = getDb();
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file) throw new Error("Datei nicht gefunden");
  if (!file.deletedAt) return; // already active, no-op

  // Check for active sha256 conflict (the partial unique index would block
  // the UPDATE anyway, but doing this explicitly lets us return a German
  // user-facing message instead of a Postgres unique_violation surface).
  const conflict = await db.query.files.findFirst({
    where: and(
      eq(files.sha256, file.sha256),
      isNull(files.deletedAt),
      ne(files.id, fileId),
    ),
  });
  if (conflict) {
    throw new Error("Eine neue Version dieses Belegs ist bereits aktiv.");
  }

  await db
    .update(files)
    .set({ deletedAt: null, deleteReason: null })
    .where(eq(files.id, fileId));
}
