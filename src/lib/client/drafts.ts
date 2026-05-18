/**
 * IndexedDB draft persistence for the Auslage submission form.
 *
 * - Metadata (all fields except the file blob) stored in IndexedDB "metadata" store.
 * - File blob stored separately in IndexedDB "files" store (sessionStorage is too small).
 * - saveDraft: debounced 1 s — call on every input change.
 * - loadDraft: call on form open; returns null if nothing saved.
 * - clearDraft: call on successful submit.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "fdw-auslage-drafts";
const DB_VERSION = 1;
const DRAFT_KEY = "current";

export interface DraftMetadata {
  bezahltVonKind: "verein" | "member" | "extern";
  memberId?: string;
  memberDisplayName?: string;
  memberEmail?: string;
  externName?: string;
  externIban?: string;
  externEmail?: string;
  bezeichnung: string;
  betrag: string;
  rechnungsdatum: string;
  wofuer: string;
  kommentar: string;
  savedAt: number;
}

export interface Draft {
  metadata: DraftMetadata;
  file: File | null;
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

export async function saveDraft(
  metadata: Omit<DraftMetadata, "savedAt">,
  file: File | null,
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["metadata", "files"], "readwrite");
    await tx
      .objectStore("metadata")
      .put({ ...metadata, savedAt: Date.now() }, DRAFT_KEY);
    if (file) {
      await tx.objectStore("files").put(file, DRAFT_KEY);
    } else {
      await tx.objectStore("files").delete(DRAFT_KEY);
    }
    await tx.done;
  } catch (err) {
    // Draft persistence is best-effort; never block the user.
    console.warn("[drafts] saveDraft failed:", err);
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const db = await getDb();
    const metadata = await db.get("metadata", DRAFT_KEY);
    if (!metadata) return null;
    const file = (await db.get("files", DRAFT_KEY)) ?? null;
    return { metadata: metadata as DraftMetadata, file };
  } catch (err) {
    console.warn("[drafts] loadDraft failed:", err);
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

/** Debounce helper — wraps saveDraft with a 1 s delay. */
export function makeDebouncedSave(delayMs = 1000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function debouncedSave(
    metadata: Omit<DraftMetadata, "savedAt">,
    file: File | null,
  ): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveDraft(metadata, file);
    }, delayMs);
  };
}
