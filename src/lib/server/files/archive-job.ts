/**
 * Phase 9 Task 15 — year-close archive job + monitor.
 *
 * `archiveYear(year)` walks every unarchived, non-soft-deleted file whose
 * generated `year_of_buchung` matches `year`, moves the blob to the
 * `archived/<old-pathname>` path via the storage backend, and atomically
 * updates `files.storage_key` + writes an audit_log row.
 *
 * Crash-safe: a per-file try/catch keeps a single failure from poisoning the
 * batch. Re-running the job skips rows whose `storage_key` already starts with
 * `archived/` (notLike filter) — the storage backend's archive() will already
 * refuse to overwrite an existing archived path (StorageImmutabilityError),
 * but the DB-level filter avoids even attempting the storage call.
 *
 * This runs BEFORE `closeBuchhaltungsjahr(year)` in the year-close route
 * action (see src/routes/app/jahresabschluss/[year]/+page.server.ts). The
 * files Festschreibung trigger arms once `settings.festgeschrieben_bis`
 * catches up; today no app code sets that automatically, but running archive
 * first is belt-and-suspenders against any future code path that flips the
 * setting before this job runs.
 *
 * `findUnarchivedClosedYearFiles()` is a monitor surface for admin tooling /
 * cron: returns the files that should have been archived (closed year + still
 * at a non-archived path + not soft-deleted). Expected empty in a healthy
 * system; non-empty == archive crashed and never resumed.
 */

import { eq, and, sql, isNull, notLike } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { getFileStorage, type StorageBackend } from "./storage.js";
import { logAudit } from "$lib/server/audit-log/index.js";

export interface ArchiveYearResult {
  archived: number;
  failed: number;
  total: number;
}

export async function archiveYear(year: number): Promise<ArchiveYearResult> {
  const db = getDb();
  const candidates = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.yearOfBuchung, year),
        isNull(files.deletedAt),
        notLike(files.storageKey, "archived/%"),
      ),
    );

  let archived = 0;
  let failed = 0;

  for (const f of candidates) {
    try {
      const storage = await getFileStorage(f.storageBackend as StorageBackend);
      const { newPathname } = await storage.archive(f.storageKey, year);
      await db.transaction(async (tx) => {
        await tx
          .update(files)
          .set({ storageKey: newPathname })
          .where(eq(files.id, f.id));
        await logAudit(
          {
            action: "festschreibung",
            entityKind: "file",
            entityId: f.id,
            actorUserId: null,
            payload: {
              event: "file_archived",
              oldKey: f.storageKey,
              newKey: newPathname,
            },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tx as any,
        );
      });
      archived++;
    } catch (e) {
      console.error(`[archive-job] failed for ${f.id}:`, e);
      failed++;
    }
  }

  return { archived, failed, total: candidates.length };
}

/**
 * Monitor: returns files that *should* have been archived (year_of_buchung
 * <= festgeschrieben_bis + not soft-deleted + storage_key not under
 * `archived/`). Healthy system returns `[]`. Non-empty indicates a
 * never-resumed archive job and needs operator follow-up.
 */
export async function findUnarchivedClosedYearFiles(): Promise<
  (typeof files.$inferSelect)[]
> {
  const db = getDb();
  const r = await db.execute(sql`
    SELECT public._festgeschrieben_extract_year(value) AS y
    FROM settings WHERE key = 'festgeschrieben_bis'
  `);
  // postgres-js returns rows as an array; the column comes back as `y`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closedYear = (r as any)[0]?.y as number | null | undefined;
  if (!closedYear) return [];
  return db
    .select()
    .from(files)
    .where(
      and(
        sql`${files.yearOfBuchung} <= ${closedYear}`,
        isNull(files.deletedAt),
        notLike(files.storageKey, "archived/%"),
      ),
    );
}
