/**
 * Phase 9 test-suite helper: reset `settings.festgeschrieben_bis` between
 * integration tests so DELETE FROM files never trips the Festschreibung
 * trigger, and seed/cleanup `files` rows via a single superuser connection
 * that bypasses the trigger for setup.
 *
 * Why this exists
 * ===============
 * Phase 9 introduces two interacting triggers on `settings.festgeschrieben_bis`:
 *
 *   1. A monotonic-forward UPDATE guard (app_runtime can only move the year
 *      forward).
 *   2. `assert_not_festgeschrieben_fn_files` on the `files` table, which
 *      rejects DELETE/UPDATE on rows whose `year_of_buchung <= festgeschrieben_bis`.
 *
 * Both triggers short-circuit when `session_user <> 'app_runtime'`. So a
 * postgres-role connection (DIRECT_DATABASE_URL) can reset the lock and
 * arbitrary-DELETE/UPDATE rows without tripping either trigger, regardless
 * of the prior value.
 *
 * Calling `resetFestgeschreibungBis()` at the start of `beforeEach` (before
 * the FK-safe cleanup that DELETEs from `files`) guarantees no leftover
 * "2024" value from a previous test file blocks the cleanup.
 *
 * Related vitest setting: `fileParallelism: false` in `vitest.config.ts`.
 * Without that, test files interleave their `beforeEach` setup against the
 * single shared Postgres, and two test files' admin pools end up racing on
 * `settings.festgeschrieben_bis` and `files` rows — producing non-deterministic
 * intermittent failures that look like cross-pool visibility bugs. Forcing
 * file-level serialization keeps the integration suite hermetic.
 *
 * Implementation note: we set the value to JSONB `null` — semantically "no
 * lock". The tolerant year extractor returns NULL for that shape, and the
 * monotonic trigger explicitly treats `NULL → year` as the "first-ever
 * Festschreibung" path (always allowed for app_runtime). This keeps the
 * trigger's forward-only invariant intact for tests that follow ours, such
 * as `tests/unit/tier-1-prod-hardening.test.ts` — which UPSERTs values like
 * 2024 via app_runtime and would fail if we'd left a sentinel year like 9999
 * behind. Tests that explicitly need a closed year (e.g. the trigger test in
 * `files-schema.test.ts`) still set their own value via superuser.
 */
import postgres from "postgres";

let _admin: ReturnType<typeof postgres> | null = null;

function admin(): ReturnType<typeof postgres> {
  if (_admin) return _admin;
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url || url.length === 0) {
    throw new Error(
      "DIRECT_DATABASE_URL required for festschreibung-reset helper",
    );
  }
  _admin = postgres(url, { prepare: false, max: 1 });
  return _admin;
}

/**
 * Reset `settings.festgeschrieben_bis` to JSONB `null` ("no lock") using a
 * superuser connection that bypasses both the monotonic-forward trigger and
 * the `assert_not_festgeschrieben_fn_files` trigger. Use in `beforeEach` to
 * guarantee a clean state regardless of what a prior test file left behind.
 *
 * Idempotent: safe to call repeatedly. If the row doesn't exist yet this
 * INSERTs it; otherwise UPDATEs it.
 */
export async function resetFestgeschreibungBis(): Promise<void> {
  const a = admin();
  await a`
    INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
  `;
}

/**
 * Tear down the module-level admin connection. Call from `afterAll` in any
 * test file that imports `resetFestgeschreibungBis` so the connection pool
 * doesn't keep vitest hanging on process exit.
 *
 * Safe to call multiple times.
 */
export async function closeAdminConnection(): Promise<void> {
  if (_admin) {
    await _admin.end();
    _admin = null;
  }
}

/**
 * Seed a `files` row via the superuser connection.
 *
 * Both Festschreibung triggers short-circuit when session_user <> 'app_runtime',
 * so we can INSERT into any year regardless of festgeschrieben_bis state — and
 * specifically so a leftover Festschreibung from a prior describe-block can't
 * block test setup.
 *
 * Note: `year_of_buchung` is a STORED GENERATED column derived from
 * `uploaded_at` via `year_for_booking()` — Europe/Berlin TZ — so set
 * `uploadedAt` to control the resulting year.
 *
 * Returns the inserted row's id.
 */
export async function seedFileViaAdmin(opts: {
  id?: string;
  storageKey: string;
  sha256: string;
  uploadedAt?: string;
  byteSize?: number;
  mimeType?: string;
  originalFilename?: string;
  kind?: string;
  sourceKind?: string;
  uploadedBySubmitterEmail?: string;
}): Promise<string> {
  const a = admin();
  const id = opts.id ?? crypto.randomUUID();
  const uploadedAt = opts.uploadedAt ?? new Date().toISOString();
  await a`
    INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
      original_filename, kind, source_kind, uploaded_at, uploaded_by_submitter_email)
    VALUES (
      ${id},
      ${opts.storageKey},
      'blob',
      ${opts.mimeType ?? "application/pdf"},
      ${opts.byteSize ?? 100},
      ${opts.sha256},
      ${opts.originalFilename ?? `${id}.pdf`},
      ${opts.kind ?? "beleg"},
      ${opts.sourceKind ?? "app"},
      ${uploadedAt}::timestamptz,
      ${opts.uploadedBySubmitterEmail ?? "test@x.de"}
    )
  `;
  return id;
}

/**
 * Update a `files` row via the superuser connection (bypasses the
 * Festschreibung trigger). Use when a test needs to mutate rows in a closed
 * year, or just to avoid the pool-visibility flake on subsequent reads.
 *
 * Note: `deletedAt` and `deleteReason` are written together in a single
 * statement when both are provided — the `files_deleted_reason_paired` CHECK
 * constraint requires them to flip atomically. Pass both to mark deleted, or
 * pass both as `null` to undelete. Mixing one set + one absent is supported
 * only when the row's current state already has the other set consistently.
 */
export async function updateFileViaAdmin(
  id: string,
  set: Partial<{
    storageKey: string;
    deletedAt: string | null;
    deleteReason: string | null;
  }>,
): Promise<void> {
  const a = admin();
  if (set.storageKey !== undefined) {
    await a`UPDATE files SET storage_key = ${set.storageKey} WHERE id = ${id}`;
  }
  // Pair deletedAt + deleteReason in one statement when both provided so the
  // files_deleted_reason_paired CHECK constraint is satisfied at row level.
  if (set.deletedAt !== undefined && set.deleteReason !== undefined) {
    const deletedAt = set.deletedAt;
    const deleteReason = set.deleteReason;
    if (deletedAt === null && deleteReason === null) {
      await a`UPDATE files SET deleted_at = NULL, delete_reason = NULL WHERE id = ${id}`;
    } else if (deletedAt === null || deleteReason === null) {
      throw new Error(
        "updateFileViaAdmin: deletedAt and deleteReason must both be null or both be non-null (paired CHECK).",
      );
    } else {
      await a`UPDATE files SET deleted_at = ${deletedAt}::timestamptz, delete_reason = ${deleteReason} WHERE id = ${id}`;
    }
  } else if (set.deletedAt !== undefined) {
    if (set.deletedAt === null) {
      await a`UPDATE files SET deleted_at = NULL WHERE id = ${id}`;
    } else {
      await a`UPDATE files SET deleted_at = ${set.deletedAt}::timestamptz WHERE id = ${id}`;
    }
  } else if (set.deleteReason !== undefined) {
    if (set.deleteReason === null) {
      await a`UPDATE files SET delete_reason = NULL WHERE id = ${id}`;
    } else {
      await a`UPDATE files SET delete_reason = ${set.deleteReason} WHERE id = ${id}`;
    }
  }
}

/**
 * FK-safe cleanup of `files` rows via the superuser connection. Nulls FK refs
 * in the four owner tables, then DELETEs from `files`. Optionally restrict to
 * IDs matching a text prefix (e.g. `"00000000-"` for fixture rows).
 *
 * Pass no prefix to wipe ALL files (use with care — only appropriate for
 * test files that own the database state during their run).
 */
export async function cleanupFilesViaAdmin(prefix?: string): Promise<void> {
  const a = admin();
  const idPattern = prefix !== undefined ? `${prefix}%` : "%";
  await a`UPDATE expenses              SET beleg_file_id = NULL WHERE beleg_file_id::text LIKE ${idPattern}`;
  await a`UPDATE income                SET beleg_file_id = NULL WHERE beleg_file_id::text LIKE ${idPattern}`;
  await a`UPDATE donations             SET beleg_file_id = NULL, bescheinigung_file_id = NULL
                                         WHERE beleg_file_id::text LIKE ${idPattern}
                                            OR bescheinigung_file_id::text LIKE ${idPattern}`;
  await a`UPDATE auslagen_submissions  SET beleg_file_id = NULL WHERE beleg_file_id::text LIKE ${idPattern}`;
  await a`DELETE FROM files WHERE id::text LIKE ${idPattern}`;
}
