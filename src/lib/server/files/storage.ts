/**
 * FileStorage interface v2 — §4.1.1 #5, Phase 9.
 *
 * Pathname-addressed file storage. Callers compute a stable pathname
 * (e.g. `belege/2026/03/<file-id>.pdf`) and pass it through upload /
 * download / archive. The backend returns an etag for cache invalidation
 * but never invents its own id — the canonical id lives in the `files`
 * table.
 *
 * Backends:
 *  - `blob`     → Vercel Blob (prod, default)
 *  - `local-fs` → on-disk under FILE_STORAGE_ROOT (dev + test)
 *
 * Errors are surfaced as StorageError subclasses from `./errors.ts`.
 */

import { env } from "$lib/server/env.js";

export interface FileStorage {
  /**
   * Upload bytes to `pathname`. Returns an etag that callers can persist
   * for cache invalidation. Throws StorageDuplicateError if a non-archive
   * path is already occupied and the backend refuses to overwrite.
   */
  upload(args: {
    buffer: Uint8Array;
    mimeType: string;
    pathname: string;
  }): Promise<{ etag: string }>;

  /** Read the raw bytes at `pathname`. Throws StorageNotFoundError. */
  download(pathname: string): Promise<Uint8Array>;

  /**
   * Stream the bytes at `pathname`. Preferred for downloads that may be
   * larger than a few megabytes — avoids buffering the full file in
   * memory.
   */
  downloadStream(pathname: string): Promise<ReadableStream>;

  /**
   * Move the file at `pathname` into the archive folder for `year`. The
   * archive folder is write-once: archived paths cannot be overwritten
   * (StorageImmutabilityError) per Festschreibung (ADR-0006/0012).
   */
  archive(pathname: string, year: number): Promise<{ newPathname: string }>;
}

export type StorageBackend = "blob" | "local-fs";

// ---------------------------------------------------------------------------
// Factory — selects the FileStorage implementation based on
// env.STORAGE_BACKEND. The choice is cached per process per backend.
// ---------------------------------------------------------------------------

const cached = new Map<StorageBackend, FileStorage>();

export async function getFileStorage(
  backend?: StorageBackend,
): Promise<FileStorage> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choice: StorageBackend =
    backend ?? ((env as any).STORAGE_BACKEND as StorageBackend);
  const hit = cached.get(choice);
  if (hit) return hit;
  let impl: FileStorage;
  if (choice === "blob") {
    // @vite-ignore — ./vercel-blob-impl.ts is added in Phase 9 Task 3.
    const blobPath = "./vercel-blob-impl.js";
    const { VercelBlobFileStorage } = await import(/* @vite-ignore */ blobPath);
    impl = new VercelBlobFileStorage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      token: (env as any).BLOB_READ_WRITE_TOKEN,
    });
  } else {
    const { LocalFsFileStorage } = await import("./local-fs-impl.js");
    impl = new LocalFsFileStorage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      root: (env as any).FILE_STORAGE_ROOT,
    });
  }
  cached.set(choice, impl);
  return impl;
}

// ---------------------------------------------------------------------------
// View-URL helpers — single source of truth for the /api/files/<id>/...
// URL shape used by SSR loaders, server actions, and audit log entries.
// ---------------------------------------------------------------------------

export function fileViewUrl(fileId: string): string {
  return `/api/files/${fileId}/blob`;
}

export function fileThumbnailUrl(fileId: string): string {
  return `/api/files/${fileId}/thumbnail`;
}
