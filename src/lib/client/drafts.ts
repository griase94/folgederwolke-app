/**
 * IndexedDB draft persistence for the public Auslage BATCH form (Aurora A-flow
 * S1). The form is extern-only + multi-Auslage, so a draft holds one identity
 * plus N block text metadata and a Beleg File per block (keyed by clientKey).
 *
 * - Metadata (identity + block text) stored in the "metadata" store.
 * - Beleg blobs stored as one clientKey→File record in the "files" store
 *   (IndexedDB, not sessionStorage which is too small for images).
 * - saveBatchDraft: debounce via makeDebouncedSave — call on every input change.
 * - loadBatchDraft: call on form open; null if nothing saved (or TTL-expired).
 * - clearDraft: call on successful submit (name preserved — the confirmation
 *   page imports it).
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "fdw-auslage-drafts";
// v2: batch shape replaces the single-item v1 store (no-backward-compat,
// pre-launch). The two object stores are unchanged, so no migration is needed —
// old v1 records simply fail to match the new shape and are ignored/overwritten.
const DB_VERSION = 2;
const DRAFT_KEY = "current";

export interface BatchDraftBlock {
  clientKey: string;
  bezeichnung: string;
  /** Integer cents (ADR-0003), or null when empty. */
  betragCents: number | null;
  rechnungsdatum: string;
  wofuer: string;
  kommentar: string;
}

export interface BatchDraftMetadata {
  identity: { name: string; email: string; iban: string };
  blocks: BatchDraftBlock[];
  savedAt: number;
}

export interface BatchDraft {
  metadata: BatchDraftMetadata;
  /** Beleg File per block, keyed by clientKey. */
  files: Record<string, File>;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata");
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    },
  });
}

export async function saveBatchDraft(
  metadata: Omit<BatchDraftMetadata, "savedAt">,
  files: Record<string, File>,
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["metadata", "files"], "readwrite");
    await tx
      .objectStore("metadata")
      .put({ ...metadata, savedAt: Date.now() }, DRAFT_KEY);
    // Store only the files that exist; a block without a Beleg carries none.
    const present: Record<string, File> = {};
    for (const [key, file] of Object.entries(files)) {
      if (file) present[key] = file;
    }
    if (Object.keys(present).length > 0) {
      await tx.objectStore("files").put(present, DRAFT_KEY);
    } else {
      await tx.objectStore("files").delete(DRAFT_KEY);
    }
    await tx.done;
  } catch (err) {
    // Draft persistence is best-effort; never block the user.
    console.warn("[drafts] saveBatchDraft failed:", err);
  }
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function loadBatchDraft(): Promise<BatchDraft | null> {
  try {
    const db = await getDb();
    const metadata = (await db.get("metadata", DRAFT_KEY)) as
      | BatchDraftMetadata
      | undefined;
    // Ignore anything that isn't the batch shape (e.g. a stale v1 record).
    if (!metadata || !Array.isArray(metadata.blocks) || !metadata.identity) {
      return null;
    }
    // Auto-discard drafts older than 24 hours.
    if (Date.now() - (metadata.savedAt ?? 0) > DRAFT_TTL_MS) {
      await clearDraft();
      return null;
    }
    const files =
      ((await db.get("files", DRAFT_KEY)) as
        | Record<string, File>
        | undefined) ?? {};
    return { metadata, files };
  } catch (err) {
    console.warn("[drafts] loadBatchDraft failed:", err);
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["metadata", "files"], "readwrite");
    await tx.objectStore("metadata").delete(DRAFT_KEY);
    await tx.objectStore("files").delete(DRAFT_KEY);
    await tx.done;
  } catch (err) {
    console.warn("[drafts] clearDraft failed:", err);
  }
}

/** Debounce helper — wraps saveBatchDraft with a 1 s delay. */
export function makeDebouncedSave(delayMs = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function debouncedSave(
    metadata: Omit<BatchDraftMetadata, "savedAt">,
    files: Record<string, File>,
  ): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveBatchDraft(metadata, files);
    }, delayMs);
  };
}
