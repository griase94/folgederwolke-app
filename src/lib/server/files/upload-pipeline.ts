/**
 * Upload pipeline — blob-first, DB-second, parallel-dedup-race safe.
 *
 * Phase 9 Task 11. The public Auslage form (and any future form-mode upload
 * caller) routes binary bytes through this single entry point. The pipeline:
 *
 *   Phase 0  (synchronous validation)
 *     - hard reject > 25 MiB (defence-in-depth above the function-body cap)
 *     - reject > 4.5 MiB (Vercel function body limit)
 *     - sniff MIME via `file-type`; reject mismatch against `claimedMime`
 *     - reject MIMEs not in the allowlist
 *     - reject filenames with disallowed characters
 *
 *   Phase A  (blob upload FIRST — no DB lock held during network call)
 *     - upload main blob to deterministic `belege/<year>/<id>.<ext>` path
 *     - best-effort thumbnail for raster MIMEs sharp can decode (jpeg/png/webp);
 *       HEIC/HEIF skip the thumbnail step (no libheif on Vercel); thumbnail
 *       failure is NON-FATAL — the main row is still written.
 *
 *   Phase B  (short DB transaction with concurrent-upload race handling)
 *     - pre-flight SELECT against `files.sha256` to dedup deterministic
 *       sequential uploads cheaply
 *     - INSERT inside `tx`; if a parallel uploader landed the same sha first
 *       Postgres raises `unique_violation` (23505) on `idx_files_sha256_active`
 *       — we catch it, look up the winner, and report dedupHit=true
 *     - audit_log row written on the SAME `tx` so the new file row is visible
 *       to the FK from audit_log (entity_id → files.id is loose — entity_kind
 *       discriminates; the tx still keeps the two writes atomic).
 *
 *   Phase C  (loser cleanup)
 *     - if we lost the race (dedupHit=true), del-by-path the blob we wrote
 *       so the storage backend doesn't accumulate identical-content orphans.
 *       `_internalDelByPath` is best-effort; missing methods are tolerated
 *       (the nightly reconciliation job in Task 21 sweeps remaining orphans).
 */

import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { FileStorage } from "./storage.js";
import { StorageInvalidError } from "./errors.js";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { makeImageThumbnail } from "./thumbnail.js";
import { logAudit } from "$lib/server/audit-log/index.js";

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const FUNCTION_BODY_CAP = 4.5 * 1024 * 1024;
const HARD_REJECT_CAP = 25 * 1024 * 1024;

const mimeToExt: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

// MIMEs that get a server-generated thumbnail (HEIC/HEIF excluded — sharp
// on Vercel ships without libheif).
const THUMBNAIL_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface AuslageUploadResult {
  fileId: string;
  dedupHit: boolean;
}

function currentBookingYear(): number {
  // Berlin year via Intl.DateTimeFormat — works correctly on UTC servers too.
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(new Date()),
    10,
  );
}

/**
 * C2-TAX — pipeline runner accepting the generalized identity + sourceKind.
 * Exactly one of submitterEmail / actorUserId must be non-null; sourceKind
 * propagates to files.source_kind per ADR-0010.
 *
 * Thin file-shaped wrapper (`handleAuslageUpload(file, params)` in
 * `src/lib/server/files/handleAuslageUpload.ts`) is the preferred public
 * entry point — callers should not invoke `runUploadPipeline` directly
 * unless they already have the bytes + sniffed MIME in hand (e.g. legacy
 * server actions that buffer the body for other reasons).
 */
export async function runUploadPipeline(args: {
  bytes: Uint8Array;
  claimedMime: string;
  originalFilename: string;
  submitterEmail: string | null;
  actorUserId: string | null;
  sourceKind: "form" | "app";
  storage: FileStorage;
}): Promise<AuslageUploadResult> {
  const {
    bytes,
    claimedMime,
    originalFilename,
    submitterEmail,
    actorUserId,
    sourceKind,
    storage,
  } = args;

  // ── Phase 0: synchronous validation ─────────────────────────────────────
  if (bytes.byteLength > HARD_REJECT_CAP) {
    throw new StorageInvalidError("file > 25MB hard cap");
  }
  if (bytes.byteLength > FUNCTION_BODY_CAP) {
    throw new StorageInvalidError(
      "compressed file > 4.5MB function body limit (too large)",
    );
  }
  const sniffed = await fileTypeFromBuffer(bytes);
  if (!sniffed) throw new StorageInvalidError("MIME could not be determined");
  if (claimedMime !== sniffed.mime) {
    throw new StorageInvalidError(
      `MIME mismatch: claimed ${claimedMime} ≠ sniffed ${sniffed.mime}`,
    );
  }
  if (!ALLOWED_MIMES.includes(sniffed.mime)) {
    throw new StorageInvalidError(`MIME not allowed: ${sniffed.mime}`);
  }
  if (!/^[\w\s\-.()äöüÄÖÜß!&,@+_]{1,255}$/u.test(originalFilename)) {
    throw new StorageInvalidError("filename contains disallowed characters");
  }

  const sha = createHash("sha256").update(bytes).digest("hex");
  const fileId = randomUUID();
  const year = currentBookingYear();
  const ext = mimeToExt[sniffed.mime] ?? "bin";
  const pathname = `belege/${year}/${fileId}.${ext}`;
  const thumbnailPathname = `belege/${year}/${fileId}.thumb.webp`;

  // ── Phase A: blob FIRST (no DB lock held during network call) ──────────
  await storage.upload({ buffer: bytes, mimeType: sniffed.mime, pathname });

  let thumbnailUploaded = false;
  if (THUMBNAIL_MIMES.has(sniffed.mime)) {
    try {
      const thumb = await makeImageThumbnail(bytes);
      await storage.upload({
        buffer: thumb,
        mimeType: "image/webp",
        pathname: thumbnailPathname,
      });
      thumbnailUploaded = true;
    } catch (e) {
      // Thumbnail failure is NON-FATAL — main blob landed; row records
      // thumbnail_storage_key = NULL. UI falls back to the generic icon.
      console.warn("[upload-pipeline] thumbnail failed:", e);
    }
  }

  // ── Phase B: short DB transaction with concurrent-upload race handling ──
  const db = getDb();
  let finalFileId: string = fileId;
  let dedupHit = false;

  try {
    await db.transaction(async (tx) => {
      const existing = await tx.query.files.findFirst({
        where: (f, { eq, and, isNull }) =>
          and(eq(f.sha256, sha), isNull(f.deletedAt)),
      });
      if (existing) {
        finalFileId = existing.id;
        dedupHit = true;
      } else {
        await tx.insert(files).values({
          id: fileId,
          storageKey: pathname,
          storageBackend: "blob",
          mimeType: sniffed.mime,
          byteSize: BigInt(bytes.byteLength),
          sha256: sha,
          originalFilename,
          kind: "beleg",
          thumbnailStorageKey: thumbnailUploaded ? thumbnailPathname : null,
          // C2-TAX — identity routed per the generalized signature:
          // form-mode populates submitter_email, app-mode populates user_id.
          uploadedBySubmitterEmail: submitterEmail,
          uploadedByUserId: actorUserId,
          sourceKind,
        });
        await logAudit(
          {
            action: "create",
            entityKind: "file",
            entityId: fileId,
            actorUserId: null,
            payload: {
              event: "file_uploaded",
              sha256: sha,
              byte_size: bytes.byteLength,
              pathname,
            },
          },
          tx as unknown as Parameters<typeof logAudit>[1],
        );
      }
    });
  } catch (e: unknown) {
    const err = e as {
      cause?: { code?: string };
      code?: string;
      message?: string;
    };
    const code = err?.cause?.code ?? err?.code;
    // Postgres unique_violation. Real error message is:
    // 'duplicate key value violates unique constraint "idx_files_sha256_active"'
    if (
      code === "23505" ||
      /duplicate key.*files_sha256/i.test(err?.message ?? "")
    ) {
      const winner = await db.query.files.findFirst({
        where: (f, { eq, and, isNull }) =>
          and(eq(f.sha256, sha), isNull(f.deletedAt)),
      });
      if (!winner) throw e;
      finalFileId = winner.id;
      dedupHit = true;
    } else throw e;
  }

  if (dedupHit) {
    // ── Phase C: cleanup orphan blob from our losing-race upload ─────────
    // Optional-chain BOTH method AND .catch — handles impls lacking
    // _internalDelByPath. The nightly reconciliation job (Task 21) will
    // sweep anything left behind.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (storage as any)._internalDelByPath?.(pathname)?.catch?.(() => {});
    if (thumbnailUploaded) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (storage as any)
        ._internalDelByPath?.(thumbnailPathname)
        ?.catch?.(() => {});
    }
  }

  return { fileId: finalFileId, dedupHit };
}
