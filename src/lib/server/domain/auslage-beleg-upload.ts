/**
 * The ONE Beleg-intake pipeline for Auslage submissions (Aurora A-flow S2b).
 *
 * Both submit surfaces — the public extern form and the member portal — accept
 * exactly the same bytes under exactly the same rules: size cap, prefix sniff
 * (cheap hostile-file reject), then the shared upload pipeline. Extracted here
 * so the two routes cannot drift on what counts as an acceptable Beleg; each
 * route only maps the outcome into its own `fail()` shape.
 *
 * Storage→DB ordering is preserved by the CALLER: upload every Beleg first,
 * then insert the whole batch in one transaction. A Beleg uploaded for an item
 * that later dedups is orphan litter for `scripts/files-reconcile.ts` (accepted
 * pre-launch).
 */

import type { FileStorage } from "$lib/server/files/storage.js";
import { runUploadPipeline } from "$lib/server/files/upload-pipeline.js";
import { StorageError } from "$lib/server/files/errors.js";
import { germanFileError } from "$lib/components/files/file-error-messages.js";
import {
  MAX_BELEG_BYTES,
  SNIFF_PREFIX_BYTES,
  validateBelegPrefix,
  sanitizeFilename,
} from "./file-validation.js";

export type BelegIntakeResult =
  | { ok: true; belegFileId: string; originalName: string }
  | {
      ok: false;
      /** HTTP status the route should fail with. */
      status: number;
      /** German, member-readable reason — safe to show on the field. */
      message: string;
    };

/**
 * Validate and store ONE Beleg. Never throws for a bad upload: a rejected file
 * is a form outcome, not an exception.
 */
export async function intakeBeleg(args: {
  file: File;
  /** Provenance for the files row. */
  submitterEmail: string | null;
  actorUserId: string | null;
  storage: FileStorage;
}): Promise<BelegIntakeResult> {
  const { file, submitterEmail, actorUserId, storage } = args;

  if (file.size > MAX_BELEG_BYTES) {
    const mib = MAX_BELEG_BYTES / 1024 / 1024;
    return {
      ok: false,
      status: 413,
      message: `Beleg zu groß (max ${mib} MiB).`,
    };
  }

  // Phase 1: prefix sniff — reject hostile files before buffering them.
  const declared = file.type || "application/octet-stream";
  let prefix: Uint8Array;
  try {
    prefix = new Uint8Array(
      await file.slice(0, SNIFF_PREFIX_BYTES).arrayBuffer(),
    );
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Beleg konnte nicht gelesen werden.",
    };
  }
  const prefixCheck = validateBelegPrefix(prefix, declared);
  if (!prefixCheck.valid) {
    return { ok: false, status: 415, message: prefixCheck.reason };
  }

  // Phase 2: buffer + upload.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      status: 400,
      message: "Beleg konnte nicht gelesen werden.",
    };
  }

  const originalName = sanitizeFilename(file.name || "beleg");
  try {
    const uploadResult = await runUploadPipeline({
      bytes,
      claimedMime: prefixCheck.sniffedMime,
      originalFilename: originalName,
      submitterEmail,
      actorUserId,
      // ADR-0010: a Beleg the submitter uploaded themselves is the form
      // channel — for the member portal too, even though they are logged in.
      sourceKind: "form",
      storage,
    });
    return {
      ok: true,
      belegFileId: uploadResult.fileId,
      originalName: file.name,
    };
  } catch (uploadErr) {
    if (uploadErr instanceof StorageError) {
      const status =
        uploadErr.code === "STORAGE_INVALID" ||
        uploadErr.code === "STORAGE_DUPLICATE"
          ? 422
          : 502;
      return { ok: false, status, message: germanFileError(uploadErr.code) };
    }
    console.error("[auslage-beleg] unexpected upload error:", uploadErr);
    return { ok: false, status: 500, message: germanFileError("UNKNOWN") };
  }
}
