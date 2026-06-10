/**
 * C2-TAX — Phase-9 helper generalization.
 *
 * Thin, file-shaped wrapper around the existing Phase-9 upload pipeline
 * (`src/lib/server/files/upload-pipeline.ts`). Provides a single entry point
 * used by:
 *   - public `/auslage-einreichen` form    → sourceKind: "form" + submitterEmail
 *   - admin `/app/{ausgaben|einnahmen|spenden}/neu` → sourceKind: "app" + actorUserId
 *
 * The wrapper:
 *   1. Validates the params (Zod) — exactly one of submitterEmail / actorUserId
 *      must be present; sourceKind is required.
 *   2. Performs size + magic-byte prefix sniff via the existing
 *      `validateBelegPrefix` (lives in $lib/server/domain/file-validation),
 *      so the wrapper rejects hostile files BEFORE buffering the full body.
 *   3. Delegates to the existing Phase-9 pipeline for upload + DB insert +
 *      audit-log emission. The pipeline's parallel-dedup-race handling and
 *      Drive→DB ordering with best-effort cleanup are preserved unchanged.
 *   4. Routes `sourceKind` and the identity column (`uploadedBySubmitterEmail`
 *      or `uploadedByUserId`) per ADR-0010.
 *
 * Preserves all Phase-9 validation (MIME sniff, size cap, idempotency-by-sha).
 */

import { z } from "zod";
import type { FileStorage } from "./storage.js";
import { getFileStorage } from "./storage.js";
import { runUploadPipeline } from "./upload-pipeline.js";
import {
  MAX_BELEG_BYTES,
  SNIFF_PREFIX_BYTES,
  validateBelegPrefix,
  sanitizeFilename,
} from "$lib/server/domain/file-validation.js";

const ParamsSchema = z
  .object({
    submitterEmail: z.string().email().optional(),
    actorUserId: z.string().uuid().optional(),
    /** Per ADR-0010 — propagates to files.source_kind */
    sourceKind: z.enum(["form", "app"]),
    /** Optional FileStorage injection seam for tests */
    storage: z.unknown().optional(),
  })
  .refine((p) => Boolean(p.submitterEmail) || Boolean(p.actorUserId), {
    message:
      "handleAuslageUpload: at least one of `submitterEmail` or `actorUserId` is required",
  });

export type HandleAuslageUploadParams = {
  submitterEmail?: string;
  actorUserId?: string;
  sourceKind: "form" | "app";
  /** Optional FileStorage injection — tests may pass a stub. */
  storage?: FileStorage;
};

export interface HandleAuslageUploadResult {
  fileId: string;
  /** True if the same SHA already existed; we returned the existing row. */
  dedupHit: boolean;
  sniffedMimeType: string;
  sanitizedFilename: string;
}

/**
 * Generalized Beleg upload helper. See module-level doc for the call sites.
 *
 * @param file        the multipart File to upload (size + MIME validated)
 * @param paramsInput identity (submitterEmail XOR actorUserId) + sourceKind
 *                    + optional FileStorage override (test seam)
 */
export async function handleAuslageUpload(
  file: File,
  paramsInput: HandleAuslageUploadParams,
): Promise<HandleAuslageUploadResult> {
  // ── Param validation (Zod + runtime identity assertion) ─────────────────
  const parsed = ParamsSchema.safeParse(paramsInput);
  if (!parsed.success) {
    // Zod's refine() message is already actionable — surface it.
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(msg);
  }
  const params = parsed.data;

  // ── Size cap (defence-in-depth above the upload-pipeline cap) ──────────
  if (file.size === 0) {
    throw new Error("Beleg-Datei ist leer.");
  }
  if (file.size > MAX_BELEG_BYTES) {
    throw new Error(
      `Beleg-Datei zu groß (max ${MAX_BELEG_BYTES / 1024 / 1024} MiB).`,
    );
  }

  // ── Phase 1: prefix sniff (≤ SNIFF_PREFIX_BYTES bytes in memory) ───────
  const declaredMime = file.type || "application/octet-stream";
  const prefix = new Uint8Array(
    await file.slice(0, SNIFF_PREFIX_BYTES).arrayBuffer(),
  );
  const prefixCheck = validateBelegPrefix(prefix, declaredMime);
  if (!prefixCheck.valid) {
    throw new Error(prefixCheck.reason);
  }
  const sniffedMimeType = prefixCheck.sniffedMime;

  // ── Phase 2: buffer full body (size already capped) ────────────────────
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sanitizedFilename = sanitizeFilename(file.name || "beleg");

  // ── Delegate to the Phase-9 pipeline ───────────────────────────────────
  const storage = paramsInput.storage ?? (await getFileStorage());
  const result = await runUploadPipeline({
    bytes,
    claimedMime: sniffedMimeType,
    originalFilename: sanitizedFilename,
    submitterEmail: params.submitterEmail ?? null,
    actorUserId: params.actorUserId ?? null,
    sourceKind: params.sourceKind,
    storage,
  });

  return {
    fileId: result.fileId,
    dedupHit: result.dedupHit,
    sniffedMimeType,
    sanitizedFilename,
  };
}
