#!/usr/bin/env tsx
/**
 * Phase 9 Task 16 — orphan reconciliation (manual; 48h age threshold).
 *
 * DATA-LOSS-CRITICAL. Detects + repairs drift between the `files` table and
 * the blob store:
 *
 *   - Orphans (blob without DB row, aged > 48h) → move to `quarantine/`.
 *   - Broken refs (DB row without blob) → soft-delete with
 *     `delete_reason='blob_missing'`.
 *
 * Both actions are audit-logged. The 48h threshold guards against
 * false-positive quarantining of in-flight uploads — the upload pipeline
 * writes the blob a few milliseconds before the DB row, so a same-tick scan
 * would race the writer.
 *
 * Run manually via `pnpm files:reconcile`. Not scheduled (no nightly cron
 * in Phase 9 — calibrated to Verein scale).
 */
import { eq, isNull } from "drizzle-orm";

import { logAudit } from "$lib/server/audit-log/index.js";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { getFileStorage } from "$lib/server/files/storage.js";

const AGE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export async function reconcile(): Promise<{
  orphansFound: number;
  quarantined: number;
  brokenRefs: number;
}> {
  const db = getDb();
  const now = Date.now();

  const dbRows = await db.select().from(files).where(isNull(files.deletedAt));
  const dbKeys = new Set(dbRows.map((r) => r.storageKey));

  const storage = await getFileStorage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blobsList: any = await (storage as any)._internalList?.();
  const blobs: {
    pathname: string;
    uploadedAt: Date | string;
    size: number;
  }[] = blobsList?.blobs ?? [];

  // Orphans: blobs not in DB, aged > 48h.
  const orphans = blobs.filter((b) => {
    if (dbKeys.has(b.pathname)) return false;
    const ageMs = now - new Date(b.uploadedAt).getTime();
    return ageMs >= AGE_THRESHOLD_MS;
  });

  let quarantined = 0;
  for (const o of orphans) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (storage as any)._internalQuarantine?.(o.pathname);
      await logAudit({
        action: "delete",
        entityKind: "file",
        entityId: null,
        actorUserId: null,
        actorKind: "system",
        payload: {
          event: "file_orphan_quarantined",
          pathname: o.pathname,
        },
      });
      quarantined++;
    } catch (e) {
      console.error(`[reconcile] quarantine failed for ${o.pathname}:`, e);
    }
  }

  // Broken refs: DB rows with no matching blob.
  const blobKeys = new Set(blobs.map((b) => b.pathname));
  const brokenRefs = dbRows.filter((r) => !blobKeys.has(r.storageKey));
  for (const r of brokenRefs) {
    await db
      .update(files)
      .set({ deletedAt: new Date(), deleteReason: "blob_missing" })
      .where(eq(files.id, r.id));
    await logAudit({
      action: "delete",
      entityKind: "file",
      entityId: r.id,
      actorUserId: null,
      actorKind: "system",
      payload: {
        event: "file_broken_reference",
        storage_key: r.storageKey,
      },
    });
  }

  return {
    orphansFound: orphans.length,
    quarantined,
    brokenRefs: brokenRefs.length,
  };
}

// CLI entry — only fires when invoked directly via `tsx scripts/files-reconcile.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  reconcile()
    .then((r) => {
      console.log("Reconcile complete:", JSON.stringify(r));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
