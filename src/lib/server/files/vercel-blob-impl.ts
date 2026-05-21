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

import {
  BlobError,
  BlobNotFoundError,
  copy,
  del,
  head,
  list,
  put,
} from "@vercel/blob";
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
 *
 * Detection strategy:
 *
 * - **Not found**: `instanceof BlobNotFoundError`. The SDK emits this for the
 *   API `not_found` response code (`getBlobError` in chunk-3D2SZ6M2.js).
 *   Message is "Vercel Blob: The requested blob does not exist" — regex
 *   matching against that string was unreliable, so we match the class.
 * - **Duplicate write**: the SDK has no dedicated class. When `put` is called
 *   with `allowOverwrite: false` against an existing blob, the API returns
 *   `not_allowed`, which falls through `getBlobError`'s switch to
 *   `BlobUnknownError("Unknown error, please visit https://vercel.com/help.")`.
 *   This is indistinguishable from a real unknown error via class alone — so
 *   we rely on the caller passing an `op: "write_no_overwrite"` hint. In that
 *   context a non-NotFound `BlobError` is overwhelmingly a duplicate-write
 *   conflict (auth/store/precondition failures fail much earlier, with their
 *   own dedicated subclasses we leave as `StorageNetworkError`). We also keep
 *   a message-regex fallback to catch any future SDK change that exposes a
 *   clearer signal (`already exists`, `operation_not_allowed`).
 * - **Everything else**: `StorageNetworkError`, preserving the original
 *   error via `cause`.
 */
type WrapOp = "write_no_overwrite" | "other";

function wrap(e: unknown, op: WrapOp = "other"): Error {
  if (e instanceof BlobNotFoundError) {
    return new StorageNotFoundError(redact(e.message), e);
  }
  if (e instanceof Error) {
    const msg = redact(e.message);
    const looksLikeDuplicate =
      /already exists|operation_not_allowed|not[_\s]allowed/i.test(msg);
    if (
      e instanceof BlobError &&
      (op === "write_no_overwrite" || looksLikeDuplicate)
    ) {
      return new StorageDuplicateError(msg, e);
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
      throw wrap(e, "write_no_overwrite");
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
