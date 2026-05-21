/**
 * LocalFsFileStorage — FileStorage v2 implementation backed by the local
 * filesystem. Used in dev and tests so the app can run offline without
 * Vercel Blob credentials.
 *
 * Layout under <root>:
 *   <root>/<pathname>                       -- file bytes at the caller-supplied pathname
 *   <root>/archived/<pathname>              -- post-archive location (rename, not copy)
 *
 * Pathname semantics follow the FileStorage v2 contract: caller-controlled,
 * traversal-safe, normalized, and write-once for reserved prefixes
 * (archived/, quarantine/, tmp/).
 */

import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import {
  StorageDuplicateError,
  StorageImmutabilityError,
  StorageInvalidError,
  StorageNetworkError,
  StorageNotFoundError,
} from "./errors.js";
import type { FileStorage } from "./storage.js";

const RESERVED_PREFIXES = ["archived/", "quarantine/", "tmp/"];

function validatePathname(p: string): void {
  if (
    p.includes("..") ||
    p.includes("\0") ||
    p.startsWith("/") ||
    p.includes("//")
  ) {
    throw new StorageInvalidError(`unsafe pathname: ${p}`);
  }
  if (normalize(p) !== p) {
    throw new StorageInvalidError(`non-normalized pathname: ${p}`);
  }
}

function denyPublicReservedWrite(p: string): void {
  for (const r of RESERVED_PREFIXES) {
    if (p.startsWith(r)) throw new StorageImmutabilityError(p);
  }
}

export class LocalFsFileStorage implements FileStorage {
  constructor(private readonly opts: { root: string }) {}

  async upload({
    buffer,
    mimeType: _mimeType,
    pathname,
  }: {
    buffer: Uint8Array;
    mimeType: string;
    pathname: string;
  }): Promise<{ etag: string }> {
    validatePathname(pathname);
    denyPublicReservedWrite(pathname);
    if (buffer.byteLength === 0) {
      throw new StorageInvalidError("empty buffer");
    }
    const full = join(this.opts.root, pathname);
    await mkdir(dirname(full), { recursive: true });
    // Write atomically with `wx` flag — fails with EEXIST if the file exists,
    // closing the TOCTOU window that a stat-then-write check would leave open.
    try {
      await writeFile(full, buffer, { flag: "wx" });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "EEXIST") throw new StorageDuplicateError(pathname, e);
      throw err;
    }
    return { etag: `"${buffer.byteLength}-${Date.now()}"` };
  }

  async download(pathname: string): Promise<Uint8Array> {
    validatePathname(pathname);
    const full = join(this.opts.root, pathname);
    try {
      return new Uint8Array(await readFile(full));
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") throw new StorageNotFoundError(pathname);
      throw new StorageNetworkError(err?.message ?? "unknown fs error", e);
    }
  }

  async downloadStream(pathname: string): Promise<ReadableStream> {
    validatePathname(pathname);
    const full = join(this.opts.root, pathname);
    try {
      await stat(full);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") throw new StorageNotFoundError(pathname);
      throw e;
    }
    return Readable.toWeb(createReadStream(full)) as ReadableStream;
  }

  async archive(
    pathname: string,
    _year: number,
  ): Promise<{ newPathname: string }> {
    validatePathname(pathname);
    if (RESERVED_PREFIXES.some((p) => pathname.startsWith(p))) {
      throw new StorageImmutabilityError(pathname);
    }
    const newPathname = `archived/${pathname}`;
    const oldPath = join(this.opts.root, pathname);
    const newPath = join(this.opts.root, newPathname);
    try {
      await stat(oldPath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") throw new StorageNotFoundError(pathname);
      throw e;
    }
    await mkdir(dirname(newPath), { recursive: true });
    await rename(oldPath, newPath);
    return { newPathname };
  }

  /** @internal — only for upload-pipeline dedup-cleanup and reconciliation. Grep-guarded in Task 21. */
  async _internalDelByPath(pathname: string): Promise<void> {
    validatePathname(pathname);
    try {
      await unlink(join(this.opts.root, pathname));
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code !== "ENOENT") throw err;
    }
  }
}
