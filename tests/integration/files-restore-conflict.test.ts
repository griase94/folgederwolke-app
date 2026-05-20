/**
 * Phase 9 Task 14 — restoreFile() sha256-conflict guard.
 *
 * The `files.sha256` partial unique index (`WHERE deleted_at IS NULL`) means
 * only one active row may exist per content hash. restoreFile() must refuse
 * to flip `deleted_at` back to NULL when a newer active row already occupies
 * that hash, returning a German-language error for the admin UI.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { restoreFile } from "$lib/server/files/restore.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

describe("restoreFile sha256 conflict", () => {
  beforeEach(async () => {
    const db = getDb();
    // FK-safe selective cleanup: null FK refs in all four owner tables for our
    // fixture file IDs, then DELETE the fixture files themselves.
    await db.execute(
      sql`UPDATE expenses              SET beleg_file_id = NULL WHERE beleg_file_id IN (SELECT id FROM files WHERE id::text LIKE '00000000-%')`,
    );
    await db.execute(
      sql`UPDATE income                SET beleg_file_id = NULL WHERE beleg_file_id IN (SELECT id FROM files WHERE id::text LIKE '00000000-%')`,
    );
    await db.execute(
      sql`UPDATE donations             SET beleg_file_id = NULL, bescheinigung_file_id = NULL WHERE beleg_file_id IN (SELECT id FROM files WHERE id::text LIKE '00000000-%') OR bescheinigung_file_id IN (SELECT id FROM files WHERE id::text LIKE '00000000-%')`,
    );
    await db.execute(
      sql`UPDATE auslagen_submissions  SET beleg_file_id = NULL WHERE beleg_file_id IN (SELECT id FROM files WHERE id::text LIKE '00000000-%')`,
    );
    await db.execute(sql`DELETE FROM files WHERE id::text LIKE '00000000-%'`);
  });

  it("rejects restore when active row with same sha256 exists", async () => {
    const sha = "a".repeat(64);
    await getDb().execute(sql`
      INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
        original_filename, kind, source_kind, uploaded_by_submitter_email, deleted_at, delete_reason)
      VALUES
        ('00000000-0000-0000-0000-000000000001','belege/2026/old.pdf','blob','application/pdf',
          100,${sha},'old.pdf','beleg','form','s@x.de','2026-01-01T10:00:00Z','user_request'),
        ('00000000-0000-0000-0000-000000000002','belege/2026/new.pdf','blob','application/pdf',
          100,${sha},'new.pdf','beleg','form','s@x.de',NULL,NULL)
    `);
    await expect(
      restoreFile("00000000-0000-0000-0000-000000000001"),
    ).rejects.toThrow(/bereits aktiv/);
  });
});
