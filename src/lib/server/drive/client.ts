/**
 * High-level Drive client (drive.file scope safe).
 *
 * Strategy: the app creates and owns a single "folgederwolke-app" folder in
 * the OAuth user's My Drive (no pre-existing parent required). The folder id
 * is persisted in settings.drive_app_folder_id so it is only created once.
 *
 * Uploads land in an `_incoming/` subfolder under that root. Idempotency is
 * achieved by storing a caller-supplied key in appProperties.uploadIdempotencyKey
 * and searching for it before creating a new file.
 *
 * Concurrency: folder lookup-or-create is wrapped in a Postgres advisory
 * transaction lock (pg_advisory_xact_lock) so two concurrent first-callers
 * can't both miss the cache and both create orphan folders.
 */

import { drive as createDrive } from "@googleapis/drive";
import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { getDriveAuth } from "./auth.js";
import { withDriveRetry } from "./retry.js";
import { DriveNotFoundError } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APP_FOLDER_NAME = "folgederwolke-app";
const INCOMING_FOLDER_NAME = "_incoming";
const SETTINGS_KEY_APP_FOLDER = "drive_app_folder_id";
const SETTINGS_KEY_INCOMING_FOLDER = "drive_incoming_folder_id";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// Idempotency key sanity check — keys are caller-supplied and end up
// interpolated into Drive `q=` strings. We only allow a safe character class
// (letters/digits/`_`, `-`, `:`) so the key cannot break out of the quoted
// literal even if escapeDriveQ were ever skipped.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_:-]+$/;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDriveClient() {
  return createDrive({ version: "v3", auth: getDriveAuth() });
}

/**
 * Escape a string for safe interpolation into a Drive API `q=` filter.
 *
 * Drive query strings use single-quoted literals. Per Google's docs (and the
 * Sheets/Drive query grammar) the only characters that must be escaped inside
 * a literal are the backslash itself and the single quote. We escape `\`
 * first to avoid double-escaping the slashes we add for `'`.
 *
 * Example:
 *   escapeDriveQ("O'Brien")   →   "O\\'Brien"
 *   escapeDriveQ("a\\b")      →   "a\\\\b"
 *
 * Always pass the result inside single quotes:  `name='${escapeDriveQ(v)}'`.
 */
export function escapeDriveQ(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Read a settings value via raw SQL; returns null if the key does not exist. */
async function readSettingRaw(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = ${key}`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  // settings.value is jsonb — the driver may return it already parsed or as a
  // raw string depending on adapter. We only ever store strings here.
  const v = row.value;
  return typeof v === "string" ? v : null;
}

/** Create a Drive folder with the given name, optionally under a parent. */
async function createFolder(name: string, parentId?: string): Promise<string> {
  const driveClient = getDriveClient();
  const parents = parentId ? [parentId] : undefined;

  const res = await withDriveRetry(() =>
    driveClient.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents },
      fields: "id",
    }),
  );

  const id = res.data.id;
  if (!id)
    throw new Error(`Drive folder creation returned no id (name=${name})`);
  return id;
}

/**
 * Generic race-safe "find-or-create folder, then persist its id under
 * `settingsKey`" routine. Uses pg_advisory_xact_lock keyed off the settings
 * key so concurrent first-callers serialize and only one folder is created.
 */
async function findOrCreateFolderWithLock(
  settingsKey: string,
  create: () => Promise<string>,
): Promise<string> {
  // Fast path: the setting is already populated.
  const cached = await readSettingRaw(settingsKey);
  if (cached) return cached;

  // Slow path: serialize via advisory lock; re-read inside the transaction
  // to absorb the case where another worker just won the race.
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`drive_folder:${settingsKey}`}))`,
    );

    const inside = await tx.execute<{ value: unknown }>(
      sql`SELECT value FROM settings WHERE key = ${settingsKey}`,
    );
    const existing = (inside as { value: unknown }[])[0]?.value;
    if (typeof existing === "string") return existing;

    // We hold the lock — safe to create the folder and persist.
    const folderId = await create();
    await tx.execute(
      sql`
        INSERT INTO settings (key, value, updated_at)
        VALUES (${settingsKey}, ${JSON.stringify(folderId)}::jsonb, NOW())
        ON CONFLICT (key) DO NOTHING
      `,
    );
    return folderId;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the app root folder id, creating it (and persisting to settings) on
 * first call. Subsequent calls return the cached settings value — no Drive
 * round-trip needed.
 *
 * Concurrency-safe: uses pg_advisory_xact_lock to serialize first-time
 * creation across workers / requests.
 */
export async function getOrCreateAppFolder(): Promise<string> {
  return findOrCreateFolderWithLock(SETTINGS_KEY_APP_FOLDER, () =>
    // Create the root folder in My Drive (no parent = user's root)
    createFolder(APP_FOLDER_NAME),
  );
}

/**
 * Returns the `_incoming/` subfolder id under the app root, creating it on
 * first call. Concurrency-safe via advisory lock.
 */
async function getOrCreateIncomingFolder(): Promise<string> {
  return findOrCreateFolderWithLock(SETTINGS_KEY_INCOMING_FOLDER, async () => {
    const appFolderId = await getOrCreateAppFolder();
    return createFolder(INCOMING_FOLDER_NAME, appFolderId);
  });
}

export interface UploadBelegOptions {
  buffer: Buffer;
  mimeType: string;
  name: string;
  /** Stable caller-supplied key used for idempotent re-uploads. */
  idempotencyKey: string;
}

export interface UploadBelegResult {
  driveFileId: string;
  webViewLink: string;
}

/**
 * Uploads a Beleg file to the `_incoming/` folder.
 *
 * Idempotency: searches for an existing file with the same
 * appProperties.uploadIdempotencyKey before creating a new one. Safe to call
 * multiple times on form retry — returns the same driveFileId each time.
 *
 * If a matching file is found but its `webViewLink` was not returned by the
 * list call (Drive occasionally omits it), we fetch the link separately
 * rather than fall through to a duplicate upload.
 */
export async function uploadBeleg(
  opts: UploadBelegOptions,
): Promise<UploadBelegResult> {
  if (!IDEMPOTENCY_KEY_RE.test(opts.idempotencyKey)) {
    throw new Error("invalid idempotencyKey");
  }

  const driveClient = getDriveClient();

  // --- Idempotency check ---------------------------------------------------
  const safeKey = escapeDriveQ(opts.idempotencyKey);
  const searchRes = await withDriveRetry(() =>
    driveClient.files.list({
      q: `appProperties has { key='uploadIdempotencyKey' and value='${safeKey}' } and trashed=false`,
      fields: "files(id,webViewLink)",
      spaces: "drive",
    }),
  );

  const existing = searchRes.data.files?.[0];
  if (existing?.id) {
    if (existing.webViewLink) {
      return { driveFileId: existing.id, webViewLink: existing.webViewLink };
    }

    // Drive occasionally omits webViewLink from list responses. Fetch it
    // explicitly before falling through to a duplicate upload.
    const getRes = await withDriveRetry(() =>
      driveClient.files.get({
        fileId: existing.id!,
        fields: "webViewLink",
      }),
    );
    const link = getRes.data.webViewLink;
    if (link) {
      return { driveFileId: existing.id, webViewLink: link };
    }
    throw new Error(
      `Drive idempotency hit (id=${existing.id}) but webViewLink unavailable`,
    );
  }

  // --- Upload new file -----------------------------------------------------
  const incomingFolderId = await getOrCreateIncomingFolder();

  const createRes = await withDriveRetry(() =>
    driveClient.files.create({
      requestBody: {
        name: opts.name,
        parents: [incomingFolderId],
        appProperties: { uploadIdempotencyKey: opts.idempotencyKey },
      },
      media: {
        mimeType: opts.mimeType,
        body: Readable.from(opts.buffer),
      },
      fields: "id,webViewLink",
    }),
  );

  const fileId = createRes.data.id;
  const webViewLink = createRes.data.webViewLink;

  if (!fileId) throw new Error("Drive file upload returned no id");
  if (!webViewLink)
    throw new Error("Drive file upload returned no webViewLink");

  return { driveFileId: fileId, webViewLink };
}

/**
 * Downloads the raw bytes of a Drive file by id.
 * Used for admin preview (Phase 4).
 */
export async function getBelegBytes(driveFileId: string): Promise<Buffer> {
  const driveClient = getDriveClient();

  const res = await withDriveRetry(() =>
    driveClient.files.get(
      { fileId: driveFileId, alt: "media" },
      { responseType: "arraybuffer" },
    ),
  );

  const data = res.data as unknown;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new DriveNotFoundError(
    `Unexpected response type from Drive get: ${typeof data}`,
    driveFileId,
  );
}

/**
 * Moves a file from its current parent to a named subfolder under the app
 * root folder (creating the subfolder if needed).
 *
 * Used in Phase 4 to archive processed Belege into year/category subfolders.
 *
 * The find-or-create step is wrapped in an advisory lock keyed by folder
 * name so two concurrent archive calls for the same target don't both
 * create orphan subfolders.
 */
export async function archiveBelegToFolder(
  driveFileId: string,
  folderName: string,
): Promise<void> {
  const driveClient = getDriveClient();
  const appFolderId = await getOrCreateAppFolder();

  // Find-or-create the target subfolder under advisory lock. We don't persist
  // its id in settings (subfolder names can be anything), so the lock is the
  // only race protection we have.
  const db = getDb();
  const targetFolderId = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`drive_subfolder:${appFolderId}:${folderName}`}))`,
    );

    const safeName = escapeDriveQ(folderName);
    const safeParent = escapeDriveQ(appFolderId);
    const safeMime = escapeDriveQ(FOLDER_MIME);
    const listRes = await withDriveRetry(() =>
      driveClient.files.list({
        q: `name='${safeName}' and '${safeParent}' in parents and mimeType='${safeMime}' and trashed=false`,
        fields: "files(id)",
        spaces: "drive",
      }),
    );

    const found = listRes.data.files?.[0]?.id;
    if (found) return found;
    return createFolder(folderName, appFolderId);
  });

  // Get current parents so we can remove them when moving
  const fileRes = await withDriveRetry(() =>
    driveClient.files.get({ fileId: driveFileId, fields: "parents" }),
  );

  const currentParents = fileRes.data.parents?.join(",") ?? "";

  await withDriveRetry(() =>
    driveClient.files.update({
      fileId: driveFileId,
      addParents: targetFolderId,
      removeParents: currentParents,
      requestBody: {},
      fields: "id,parents",
    }),
  );
}
