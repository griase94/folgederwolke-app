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
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Phase 9 review-1 P1 — broken-ref marking via superuser connection.
 *
 * The L3 Festschreibung trigger (`assert_not_festgeschrieben_fn_files`) has
 * a `session_user = 'app_runtime'` gate. App-runtime UPDATEs against rows
 * whose `year_of_buchung <= settings.festgeschrieben_bis` are rejected by
 * design — but reconciliation needs to flag genuinely-missing blobs even
 * when they're in a closed year (operators need a faithful broken-refs
 * inventory; the retention obligation MATTERS most on festgeschriebene
 * Jahre). We open a separate superuser connection via DIRECT_DATABASE_URL
 * for the soft-delete UPDATE; the trigger short-circuits and the row is
 * marked as expected. The action is audit-logged with the `via` field set
 * so any retrospective audit shows clearly which bypass path was used.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { isNull } from "drizzle-orm";
import postgres from "postgres";

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
  //
  // The UPDATE goes through a superuser connection so it bypasses the
  // app_runtime-gated Festschreibung trigger. Without this, broken refs in
  // closed years would silently fail to be marked — exactly the rows where
  // the retention obligation matters most.
  const blobKeys = new Set(blobs.map((b) => b.pathname));
  const brokenRefs = dbRows.filter((r) => !blobKeys.has(r.storageKey));

  let superuser: ReturnType<typeof postgres> | null = null;
  if (brokenRefs.length > 0) {
    const url = process.env["DIRECT_DATABASE_URL"];
    if (!url) {
      throw new Error(
        "DIRECT_DATABASE_URL is required to mark broken refs (superuser bypass of Festschreibung trigger).",
      );
    }
    superuser = postgres(url, { prepare: false, max: 1 });
  }

  try {
    for (const r of brokenRefs) {
      // superuser is guaranteed non-null inside this loop (brokenRefs.length > 0).
      await superuser!`
        UPDATE files
           SET deleted_at = now(),
               delete_reason = 'blob_missing'
         WHERE id = ${r.id}
      `;
      await logAudit({
        action: "delete",
        entityKind: "file",
        entityId: r.id,
        actorUserId: null,
        actorKind: "system",
        payload: {
          event: "file_marked_blob_missing",
          via: "reconcile_script",
          reason: "broken_ref_on_festgeschriebenes_jahr",
          storage_key: r.storageKey,
        },
      });
    }
  } finally {
    if (superuser) await superuser.end();
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
