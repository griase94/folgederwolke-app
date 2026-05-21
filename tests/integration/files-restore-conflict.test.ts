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
});
