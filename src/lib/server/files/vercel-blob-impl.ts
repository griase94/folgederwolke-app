/**
 * VercelBlobFileStorage — FileStorage v2 implementation backed by Vercel
 * Blob. This is the production backend (selected via `STORAGE_BACKEND=blob`).
 *
 * Layout under the blob store:
 *   <pathname>                 -- live, caller-controlled paths
 *   archived/<pathname>        -- post-archive, write-once per Festschreibung
 *   quarantine/<pathname>      -- moved by reconciliation when integrity fails
 *   tmp/<pathname>             -- internal staging only
 *
 * Public surface (`upload` / `archive`) refuses to write to reserved prefixes
 * (`archived/`, `quarantine/`, `tmp/`). Internal helpers (prefixed `_internal*`)
 * bypass that guard for upload-pipeline cleanup and the files-reconcile job.
 *
 * `archive` is implemented as a three-phase head + copy + delete so it can
 * resume from a partial run without surfacing a duplicate-write error. See the
 * inline phase comments below.
 *
 * Error redaction: SDK errors and fetch responses occasionally embed the
 * read/write token or an `Authorization: Bearer …` header. Every error we
 * surface is run through `redact()` before being wrapped into a typed
 * StorageError so we never leak credentials into logs or audit entries.
 */

import { copy, del, head, list, put } from "@vercel/blob";
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
}

function denyPublicReservedWrite(p: string): void {
  for (const r of RESERVED_PREFIXES) {
    if (p.startsWith(r)) throw new StorageImmutabilityError(p);
  }
}

/**
 * Strip Vercel Blob credentials before they reach a log line or audit entry.
 * Matches the `vercel_blob_rw_…` token shape plus `Authorization: Bearer …`
 * headers that the SDK sometimes embeds in error messages.
 */
function redact(s: string): string {
  return s
    .replace(/vercel_blob_rw_[A-Za-z0-9_]+/g, "vercel_blob_rw_<REDACTED>")
    .replace(/(authorization:\s*bearer\s+)[^\s,}]+/gi, "$1<REDACTED>");
}

/**
 * Map an SDK or fetch error onto a typed StorageError. RETURNS an Error;
 * does NOT throw. Callsites use `throw wrap(e)` — declaring this as
 * `never`-returning would prevent TypeScript from narrowing the surrounding
 * try/catch correctly when the wrapped result is inspected (see the
 * Phase A / Phase C branches in `archive`).
 */
function wrap(e: unknown): Error {
  if (e instanceof Error) {
    const msg = redact(e.message);
    if (/already exists|conflict|409|BlobAlreadyExists/i.test(msg)) {
      return new StorageDuplicateError(msg, e);
    }
    if (/not found|404|BlobNotFound/i.test(msg)) {
      return new StorageNotFoundError(msg, e);
    }
    return new StorageNetworkError(msg, e);
  }
  return new StorageNetworkError("unknown error");
}

export class VercelBlobFileStorage implements FileStorage {
  constructor(private readonly opts: { token: string }) {}

  async upload({
    buffer,
    mimeType,
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
    try {
      // The SDK's PutBody accepts Buffer/Blob/Readable/File but not a bare
      // Uint8Array — wrap it in a Buffer view (zero-copy, same backing memory).
      const body = Buffer.from(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
      const res = await put(pathname, body, {
        access: "private",
        contentType: mimeType,
        allowOverwrite: false,
        token: this.opts.token,
      });
      return { etag: res.url };
    } catch (e) {
      throw wrap(e);
    }
  }

  async download(pathname: string): Promise<Uint8Array> {
    validatePathname(pathname);
    try {
      const meta = await head(pathname, { token: this.opts.token });
      const res = await fetch(meta.downloadUrl, {
        headers: { authorization: `Bearer ${this.opts.token}` },
      });
      if (!res.ok) {
        throw new StorageNetworkError(`download ${res.status}`);
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      throw wrap(e);
    }
  }

  async downloadStream(pathname: string): Promise<ReadableStream> {
    validatePathname(pathname);
    try {
      const meta = await head(pathname, { token: this.opts.token });
      const res = await fetch(meta.downloadUrl, {
        headers: { authorization: `Bearer ${this.opts.token}` },
      });
      if (!res.ok || !res.body) {
        throw new StorageNetworkError(`downloadStream ${res.status}`);
      }
      return res.body;
    } catch (e) {
      throw wrap(e);
    }
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

    // Phase A: probe the destination. 404 is the only "doesn't exist" signal;
    // any other error must propagate so we don't silently overwrite or skip.
    let newSize: number | null = null;
    try {
      const meta = await head(newPathname, { token: this.opts.token });
      newSize = meta.size;
    } catch (e) {
      const wrapped = wrap(e);
      if (!(wrapped instanceof StorageNotFoundError)) throw wrapped;
    }

    // Phase B: copy when the destination is absent. `allowOverwrite: true`
    // makes the operation idempotent if a previous run crashed mid-flight
    // and left a partial destination object.
    if (newSize === null) {
      try {
        await copy(pathname, newPathname, {
          access: "private",
          allowOverwrite: true,
          token: this.opts.token,
        });
      } catch (e) {
        throw wrap(e);
      }
      try {
        newSize = (await head(newPathname, { token: this.opts.token })).size;
      } catch (e) {
        throw wrap(e);
      }
    }

    // Phase C: confirm the source matches and delete it. A size mismatch
    // means somebody mutated the source between copy and delete — refuse to
    // proceed. A missing source means a prior run already deleted it, so
    // returning normally keeps `archive` idempotent.
    try {
      const oldMeta = await head(pathname, { token: this.opts.token });
      if (oldMeta.size !== newSize) {
        throw new StorageNetworkError(
          `archive: size mismatch ${oldMeta.size} vs ${newSize}`,
        );
      }
      await del(pathname, { token: this.opts.token });
    } catch (e) {
      const wrapped = wrap(e);
      if (!(wrapped instanceof StorageNotFoundError)) throw wrapped;
    }

    return { newPathname };
  }

  /**
   * @internal — only callable from the upload-pipeline (dedup cleanup) and
   * files-reconcile. Bypasses the reserved-prefix guard. Grep-guarded in
   * Task 21.
   */
  async _internalDelByPath(pathname: string): Promise<void> {
    validatePathname(pathname);
    try {
      await del(pathname, { token: this.opts.token });
    } catch (e) {
      throw wrap(e);
    }
  }

  /** @internal — files-reconcile only. */
  async _internalList(prefix?: string) {
    try {
      return await list({ prefix, token: this.opts.token });
    } catch (e) {
      throw wrap(e);
    }
  }

  /** @internal — files-reconcile only. */
  async _internalQuarantine(srcPathname: string): Promise<void> {
    const dst = `quarantine/${srcPathname}`;
    try {
      await copy(srcPathname, dst, {
        access: "private",
        allowOverwrite: true,
        token: this.opts.token,
      });
    } catch (e) {
      throw wrap(e);
    }
    try {
      await del(srcPathname, { token: this.opts.token });
    } catch (e) {
      throw wrap(e);
    }
  }
}
