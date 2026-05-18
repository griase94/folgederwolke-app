/**
 * Google Drive implementation of FileStorage.
 *
 * Adapts the low-level drive/client.ts functions to the FileStorage interface.
 * Callers should import `driveFileStorage` rather than drive/client.ts directly
 * so the storage backend can be swapped without touching call sites.
 */

import {
  uploadBeleg,
  getBelegBytes,
  archiveBelegToFolder,
} from "$lib/server/drive/client.js";
import type { FileStorage } from "./storage.js";

export const driveFileStorage: FileStorage = {
  async upload({ buffer, mimeType, name, idempotencyKey }) {
    const result = await uploadBeleg({
      buffer: Buffer.from(buffer),
      mimeType,
      name,
      idempotencyKey,
    });
    return { id: result.driveFileId, viewUrl: result.webViewLink };
  },

  async download(id) {
    const buf = await getBelegBytes(id);
    return new Uint8Array(buf);
  },

  async archive(id, folderName) {
    await archiveBelegToFolder(id, folderName);
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_id: string) {
    // Drive deletion is deferred — files are archived, not permanently deleted,
    // to preserve the audit trail. Implement via driveClient.files.delete in
    // a future phase if hard deletion is required.
    throw new Error(
      "driveFileStorage.delete: not yet implemented — archive instead",
    );
  },
};
