/**
 * Phase 9 — soft-delete a `files` row.
 *
 * Extracted from `src/routes/app/files/+page.server.ts` so integration tests
 * can drive the L2 Festschreibung pre-check + audit_log behaviour directly,
 * mirroring the pattern of `restoreFile()` in `./restore.ts`.
 *
 * ADR-0012 §L2: pre-check `settings.festgeschrieben_bis` before mutating so
 * the user sees a friendly German error rather than a raw Postgres exception
 * from the L3 trigger.
 *
 * ADR-0012 §audit log: every state change writes an `audit_log` row inside
 * the same transaction as the mutation.
 */
import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { FestschreibungLockedError } from "./restore.js";

/** Tolerant JSONB → number for `settings.festgeschrieben_bis`. */
async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = (await db.execute(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  )) as unknown as Array<{ value: unknown }>;
  const row = rows[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Thrown when the file id is not in the `files` table. */
export class FileNotFoundError extends Error {
  constructor() {
    super("Datei nicht gefunden");
    this.name = "FileNotFoundError";
  }
}

/**
 * Mark a file as soft-deleted. Idempotent — calling on an already-deleted
 * file is a no-op (no second audit_log row).
 *
 * Throws:
 *   - `FileNotFoundError` if `fileId` is not in `files`
 *   - `FestschreibungLockedError` if the file's `year_of_buchung` is ≤
 *      `settings.festgeschrieben_bis` (L2 pre-check, ADR-0012 §L2)
 */
export async function softDeleteFile(args: {
  fileId: string;
  actorUserId: string | null;
  reason?: string;
}): Promise<void> {
  const { fileId, actorUserId } = args;
  const reason = args.reason ?? "user_request";
  const db = getDb();

  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file) throw new FileNotFoundError();
  if (file.deletedAt) return; // already deleted — idempotent

  // L2 Festschreibung pre-check.
  const festYear = await fetchFestgeschriebenBis();
  if (
    file.yearOfBuchung !== null &&
    festYear !== null &&
    file.yearOfBuchung <= festYear
  ) {
    throw new FestschreibungLockedError(
      "Buchungsjahr ist festgeschrieben – Löschen nicht möglich.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(files)
      .set({ deletedAt: new Date(), deleteReason: reason })
      .where(eq(files.id, fileId));
    await logAudit(
      {
        action: "delete",
        entityKind: "file",
        entityId: fileId,
        actorUserId,
        payload: {
          event: "file_soft_deleted",
          reason,
        },
      },
      tx as unknown as Parameters<typeof logAudit>[1],
    );
  });
}
