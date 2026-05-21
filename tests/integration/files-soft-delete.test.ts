/**
 * Phase 9 expert-audit gap closure — softDeleteFile() integration.
 *
 * Covers the two paths the existing test suite did not exercise:
 *
 * 1. **Happy path on an open year** — softDeleteFile sets `deleted_at`,
 *    sets `delete_reason`, and writes a `file_soft_deleted` audit_log row
 *    inside the same transaction (ADR-0012 §audit-log).
 *
 * 2. **L2 Festschreibung pre-check on a closed year** — softDeleteFile
 *    throws `FestschreibungLockedError` BEFORE the L3 DB trigger fires.
 *    This proves the user-facing route returns a German 409 instead of a
 *    raw Postgres exception. We also assert that NO audit_log row was
 *    written (the transaction never opened).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { softDeleteFile } from "$lib/server/files/soft-delete.js";
import { FestschreibungLockedError } from "$lib/server/files/restore.js";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  seedFileViaAdmin,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

// Local helper: set settings.festgeschrieben_bis to a specific year via
// the existing admin (superuser) connection. Bypasses both Festschreibung
// triggers — `session_user <> 'app_runtime'` short-circuits them.
async function setFestgeschriebenBis(year: number): Promise<void> {
  await getDb().execute(sql`
    INSERT INTO settings (key, value)
    VALUES ('festgeschrieben_bis', ${String(year)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);
}

describe("softDeleteFile", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    await cleanupFilesViaAdmin("00000000-");
  });

  it("happy path: marks deleted_at + writes file_soft_deleted audit_log", async () => {
    const fileId = "00000000-0000-0000-0000-0000000000c1";
    const fileSha = "c".repeat(64);
    // Upload in the current calendar year — open by default since beforeEach
    // resets festgeschrieben_bis to JSONB null.
    await seedFileViaAdmin({
      id: fileId,
      storageKey: "belege/2026/del-me.pdf",
      sha256: fileSha,
      uploadedAt: new Date().toISOString(),
      originalFilename: "del-me.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });

    await softDeleteFile({ fileId, actorUserId: null });

    // 1. files.deleted_at is now set; delete_reason='user_request'
    const rows = (await getDb().execute(sql`
      SELECT deleted_at, delete_reason FROM files WHERE id = ${fileId}
    `)) as unknown as Array<{
      deleted_at: Date | null;
      delete_reason: string | null;
    }>;
    const row = rows[0]!;
    expect(row.deleted_at).not.toBeNull();
    expect(row.delete_reason).toBe("user_request");

    // 2. audit_log row written with the right shape
    const audit = (await getDb().execute(sql`
      SELECT action, entity_kind, payload
      FROM audit_log
      WHERE entity_id = ${fileId}
      AND payload->>'event' = 'file_soft_deleted'
    `)) as unknown as Array<{
      action: string;
      entity_kind: string;
      payload: { event: string; reason: string };
    }>;
    expect(audit).toHaveLength(1);
    const auditRow = audit[0]!;
    expect(auditRow.action).toBe("delete");
    expect(auditRow.entity_kind).toBe("file");
    expect(auditRow.payload.event).toBe("file_soft_deleted");
    expect(auditRow.payload.reason).toBe("user_request");
  });

  it("idempotent: second call on already-deleted file is a no-op (no second audit row)", async () => {
    const fileId = "00000000-0000-0000-0000-0000000000c2";
    await seedFileViaAdmin({
      id: fileId,
      storageKey: "belege/2026/once.pdf",
      sha256: "d".repeat(64),
      uploadedAt: new Date().toISOString(),
      originalFilename: "once.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });
    await softDeleteFile({ fileId, actorUserId: null });
    await softDeleteFile({ fileId, actorUserId: null }); // second call

    const audit = (await getDb().execute(sql`
      SELECT count(*)::int AS c
      FROM audit_log
      WHERE entity_id = ${fileId}
      AND payload->>'event' = 'file_soft_deleted'
    `)) as unknown as Array<{ c: number }>;
    expect(audit[0]!.c).toBe(1);
  });

  it("L2 Festschreibung pre-check: throws FestschreibungLockedError on closed year, writes NO audit_log row", async () => {
    // Seed a file in a closed year (2 years ago) and close that year.
    const closedYear = new Date().getFullYear() - 2;
    const fileId = "00000000-0000-0000-0000-0000000000c3";
    await seedFileViaAdmin({
      id: fileId,
      storageKey: `belege/${closedYear}/locked.pdf`,
      sha256: "e".repeat(64),
      // Mid-year ISO string so year_for_booking() resolves to closedYear
      // regardless of which timezone the test machine sits in.
      uploadedAt: `${closedYear}-06-15T10:00:00Z`,
      originalFilename: "locked.pdf",
      sourceKind: "form",
      uploadedBySubmitterEmail: "s@x.de",
    });
    await setFestgeschriebenBis(closedYear);

    // L2 must fire BEFORE the L3 trigger surfaces a raw Postgres exception.
    await expect(
      softDeleteFile({ fileId, actorUserId: null }),
    ).rejects.toBeInstanceOf(FestschreibungLockedError);

    // L2 short-circuited before the transaction opened — files.deleted_at
    // is still null AND no audit_log row was written. The "no audit row"
    // assertion is the strict proof that L2 fires BEFORE the audit write
    // tx, not after.
    const rows = (await getDb().execute(sql`
      SELECT deleted_at FROM files WHERE id = ${fileId}
    `)) as unknown as Array<{ deleted_at: Date | null }>;
    expect(rows[0]!.deleted_at).toBeNull();

    const audit = (await getDb().execute(sql`
      SELECT count(*)::int AS c
      FROM audit_log
      WHERE entity_id = ${fileId}
    `)) as unknown as Array<{ c: number }>;
    expect(audit[0]!.c).toBe(0);
  });
});
