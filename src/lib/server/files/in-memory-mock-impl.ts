/**
 * InMemoryMockFileStorage — FileStorage v2 implementation backed by an
 * in-process Map. Used by unit tests that want zero filesystem I/O. Mirrors
 * the local-fs and Vercel Blob backends for byte-equality and error
 * semantics; not intended for production or dev server use.
 *
 * Internal-only helpers (`_internalDelByPath`, `_internalList`,
 * `_internalQuarantine`) match the shapes expected by the upload pipeline
 * and the nightly reconciliation job — see Phase 9 Tasks 6 + 21.
 */

import {
  StorageDuplicateError,
  StorageImmutabilityError,
  StorageInvalidError,
  StorageNotFoundError,
} from "./errors.js";
import type { FileStorage } from "./storage.js";

const RESERVED_PREFIXES = ["archived/", "quarantine/", "tmp/"];

interface Entry {
  bytes: Uint8Array;
  uploadedAt: Date;
}

export class InMemoryMockFileStorage implements FileStorage {
  private readonly store = new Map<string, Entry>();

  async upload({
    buffer,
    mimeType: _mimeType,
    pathname,
  }: {
    buffer: Uint8Array;
    mimeType: string;
    pathname: string;
  }): Promise<{ etag: string }> {
    if (
      pathname.includes("..") ||
      pathname.includes("\0") ||
      pathname.startsWith("/") ||
      pathname.includes("//")
    ) {
      throw new StorageInvalidError(`unsafe pathname: ${pathname}`);
    }
    for (const p of RESERVED_PREFIXES) {
      if (pathname.startsWith(p)) throw new StorageImmutabilityError(pathname);
    }
    if (buffer.byteLength === 0) {
      throw new StorageInvalidError("empty buffer");
    }
    if (this.store.has(pathname)) {
      throw new StorageDuplicateError(pathname);
    }
    this.store.set(pathname, {
      bytes: new Uint8Array(buffer),
      uploadedAt: new Date(),
    });
    return { etag: `"${buffer.byteLength}-${this.store.size}"` };
  }

  async download(p: string): Promise<Uint8Array> {
    const e = this.store.get(p);
    if (!e) throw new StorageNotFoundError(p);
    return e.bytes;
  }

  async downloadStream(p: string): Promise<ReadableStream> {
    const bytes = await this.download(p);
    return new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    });
  }

  async archive(p: string, _y: number): Promise<{ newPathname: string }> {
    if (RESERVED_PREFIXES.some((r) => p.startsWith(r))) {
      throw new StorageImmutabilityError(p);
    }
    const e = this.store.get(p);
    if (!e) throw new StorageNotFoundError(p);
    const np = `archived/${p}`;
    this.store.set(np, e);
    this.store.delete(p);
    return { newPathname: np };
  }

  /** @internal — upload-pipeline + reconciliation only */
  async _internalDelByPath(p: string): Promise<void> {
    this.store.delete(p);
  }

  /** @internal — reconciliation only. Returns Vercel-Blob-shaped list result. */
  async _internalList(_prefix?: string): Promise<{
    blobs: Array<{ pathname: string; uploadedAt: string; size: number }>;
  }> {
    return {
      blobs: Array.from(this.store.entries()).map(([pathname, e]) => ({
        pathname,
        uploadedAt: e.uploadedAt.toISOString(),
        size: e.bytes.byteLength,
      })),
    };
  }

  /** @internal — reconciliation only */
  async _internalQuarantine(src: string): Promise<void> {
    const e = this.store.get(src);
    if (!e) throw new StorageNotFoundError(src);
    this.store.set(`quarantine/${src}`, e);
    this.store.delete(src);
  }
}
