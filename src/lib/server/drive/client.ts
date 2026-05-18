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
 */

import { drive as createDrive } from "@googleapis/drive";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { settings } from "$lib/server/db/schema/settings.js";
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getDriveClient() {
  return createDrive({ version: "v3", auth: getDriveAuth() });
}

/** Read a settings value; returns null if the key does not exist. */
async function readSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, key),
  });
  if (!row) return null;
  const v = row.value;
  return typeof v === "string" ? v : null;
}

/** Upsert a settings string value. */
async function writeSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the app root folder id, creating it (and persisting to settings) on
 * first call. Subsequent calls return the cached settings value — no Drive
 * round-trip needed.
 */
export async function getOrCreateAppFolder(): Promise<string> {
  const cached = await readSetting(SETTINGS_KEY_APP_FOLDER);
  if (cached) return cached;

  // Create the root folder in My Drive (no parent = user's root)
  const folderId = await createFolder(APP_FOLDER_NAME);
  await writeSetting(SETTINGS_KEY_APP_FOLDER, folderId);
  return folderId;
}

/**
 * Returns the `_incoming/` subfolder id under the app root, creating it on
 * first call.
 */
async function getOrCreateIncomingFolder(): Promise<string> {
  const cached = await readSetting(SETTINGS_KEY_INCOMING_FOLDER);
  if (cached) return cached;

  const appFolderId = await getOrCreateAppFolder();
  const folderId = await createFolder(INCOMING_FOLDER_NAME, appFolderId);
  await writeSetting(SETTINGS_KEY_INCOMING_FOLDER, folderId);
  return folderId;
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
 */
export async function uploadBeleg(
  opts: UploadBelegOptions,
): Promise<UploadBelegResult> {
  const driveClient = getDriveClient();

  // --- Idempotency check ---------------------------------------------------
  const searchRes = await withDriveRetry(() =>
    driveClient.files.list({
      q: `appProperties has { key='uploadIdempotencyKey' and value='${opts.idempotencyKey}' } and trashed=false`,
      fields: "files(id,webViewLink)",
      spaces: "drive",
    }),
  );

  const existing = searchRes.data.files?.[0];
  if (existing?.id && existing.webViewLink) {
    return { driveFileId: existing.id, webViewLink: existing.webViewLink };
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
 */
export async function archiveBelegToFolder(
  driveFileId: string,
  folderName: string,
): Promise<void> {
  const driveClient = getDriveClient();
  const appFolderId = await getOrCreateAppFolder();

  // Find or create the target subfolder
  const listRes = await withDriveRetry(() =>
    driveClient.files.list({
      q: `name='${folderName}' and '${appFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    }),
  );

  let targetFolderId = listRes.data.files?.[0]?.id;
  if (!targetFolderId) {
    targetFolderId = await createFolder(folderName, appFolderId);
  }

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
