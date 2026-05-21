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
 *
 * ADR-0012 §L2: pre-check Festschreibung (settings.festgeschrieben_bis)
 * before mutating so the user sees a friendly German error rather than a
 * raw Postgres exception from the L3 trigger.
 *
 * ADR-0012 §audit log: every state change (delete + restore) writes an
 * audit_log row inside the same transaction as the mutation.
 */
import { eq, and, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { logAudit } from "$lib/server/audit-log/index.js";

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

/**
 * Thrown when the L2 Festschreibung pre-check refuses a restore.
 * Callers in route actions catch this and return `fail(409, …)` with the
 * German user-facing message.
 */
export class FestschreibungLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FestschreibungLockedError";
  }
}

export async function restoreFile(
  fileId: string,
  actorUserId: string | null = null,
): Promise<void> {
  const db = getDb();
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file) throw new Error("Datei nicht gefunden");
  if (!file.deletedAt) return; // already active, no-op

  // L2 Festschreibung pre-check — see ADR-0012 §L2.
  const festYear = await fetchFestgeschriebenBis();
  if (
    file.yearOfBuchung !== null &&
    festYear !== null &&
    file.yearOfBuchung <= festYear
  ) {
    throw new FestschreibungLockedError(
      "Buchungsjahr ist festgeschrieben – Wiederherstellen nicht möglich.",
    );
  }

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

  await db.transaction(async (tx) => {
    await tx
      .update(files)
      .set({ deletedAt: null, deleteReason: null })
      .where(eq(files.id, fileId));
    await logAudit(
      {
        action: "create",
        entityKind: "file",
        entityId: fileId,
        actorUserId,
        payload: {
          event: "file_restored",
        },
      },
      tx as unknown as Parameters<typeof logAudit>[1],
    );
  });
}
