/**
 * Phase 9 Task 14 — restoreFile() sha256-conflict guard.
 *
 * The `files.sha256` partial unique index (`WHERE deleted_at IS NULL`) means
 * only one active row may exist per content hash. restoreFile() must refuse
 * to flip `deleted_at` back to NULL when a newer active row already occupies
 * that hash, returning a German-language error for the admin UI.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { restoreFile } from "$lib/server/files/restore.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  seedFileViaAdmin,
  updateFileViaAdmin,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

describe("restoreFile sha256 conflict", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    // Reset festgeschrieben_bis FIRST (via superuser, bypasses triggers) so
    // the DELETE FROM files below isn't blocked by leftover state from a
    // prior test file (singleFork = state leaks across files).
    await resetFestgeschreibungBis();
    // FK-safe selective cleanup via superuser — bypasses the festgeschrieben_bis
    // trigger so leftover state from a prior describe-block can't block DELETE.
    await cleanupFilesViaAdmin("00000000-");
  });

  it("rejects restore when active row with same sha256 exists", async () => {
    const sha = "a".repeat(64);
    // Seed both rows via superuser — bypasses both Festschreibung triggers.
    await seedFileViaAdmin({
      id: "00000000-0000-0000-0000-000000000001",
      storageKey: "belege/2026/old.pdf",
      sha256: sha,
      originalFilename: "old.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });
    // Mark row 1 as deleted (paired in a single UPDATE so the
    // files_deleted_reason_paired CHECK is satisfied). This frees up the
    // sha256 unique-on-active index so we can insert row 2 with the same hash.
    await updateFileViaAdmin("00000000-0000-0000-0000-000000000001", {
      deletedAt: "2026-01-01T10:00:00Z",
      deleteReason: "user_request",
    });
    await seedFileViaAdmin({
      id: "00000000-0000-0000-0000-000000000002",
      storageKey: "belege/2026/new.pdf",
      sha256: sha,
      originalFilename: "new.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });
    await expect(
      restoreFile("00000000-0000-0000-0000-000000000001"),
    ).rejects.toThrow(/bereits aktiv/);
  });

  it("happy path: restore flips deleted_at and writes file_restored audit_log", async () => {
    // Phase 9 expert-audit gap closure: ADR-0012 §audit-log says every state
    // change writes an audit_log row. This test catches a regression where
    // logAudit is removed/misrouted from restoreFile() — the row would still
    // be successfully restored, but the audit trail would silently disappear.
    // actor_user_id has an FK to users; we don't need a real user for this
    // test (restoreFile accepts null). The audit_log row still proves the
    // logAudit call happens — it just won't be attributable to a specific
    // person, which is fine for system-initiated restores.
    const fileId = "00000000-0000-0000-0000-0000000000a1";
    const sha = "b".repeat(64);
    await seedFileViaAdmin({
      id: fileId,
      storageKey: "belege/2026/restore-me.pdf",
      sha256: sha,
      originalFilename: "restore-me.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });
    await updateFileViaAdmin(fileId, {
      deletedAt: "2026-02-01T10:00:00Z",
      deleteReason: "user_request",
    });

    await restoreFile(fileId, null);

    // 1. deleted_at cleared on the files row
    const [row] = (await getDb().execute(sql`
      SELECT deleted_at, delete_reason FROM files WHERE id = ${fileId}
    `)) as unknown as Array<{
      deleted_at: Date | null;
      delete_reason: string | null;
    }>;
    expect(row.deleted_at).toBeNull();
    expect(row.delete_reason).toBeNull();

    // 2. audit_log row exists with correct actor + payload
    const audit = (await getDb().execute(sql`
      SELECT action, entity_kind, actor_user_id, payload
      FROM audit_log
      WHERE entity_id = ${fileId}
      AND payload->>'event' = 'file_restored'
    `)) as unknown as Array<{
      action: string;
      entity_kind: string;
      actor_user_id: string | null;
      payload: { event: string };
    }>;
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("create");
    expect(audit[0].entity_kind).toBe("file");
    expect(audit[0].actor_user_id).toBeNull();
    expect(audit[0].payload.event).toBe("file_restored");
  });
});
