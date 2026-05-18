/**
 * FileStorage interface — §4.1.1 #5.
 *
 * Abstracts file operations so callers are not coupled to the Drive
 * implementation. A test double or future S3 adapter can implement this
 * interface without changing call sites.
 */

export interface FileStorage {
  /**
   * Upload a file and return a stable id and public view URL.
   * Must be idempotent: calling with the same idempotencyKey twice returns
   * the same { id, viewUrl } without creating a duplicate.
   */
  upload(opts: {
    buffer: Uint8Array;
    mimeType: string;
    name: string;
    /** Stable caller-supplied key — safe chars only: [A-Za-z0-9_:-] */
    idempotencyKey: string;
  }): Promise<{ id: string; viewUrl: string }>;

  /** Download the raw bytes of a file by its storage id. */
  download(id: string): Promise<Uint8Array>;

  /**
   * Move a file into a named archive folder.
   * Used to organise processed Belege into year/category subfolders.
   * Creates the folder if it does not exist.
   */
  archive(id: string, folderName: string): Promise<void>;

  /** Permanently delete a file by its storage id. */
  delete(id: string): Promise<void>;
}
