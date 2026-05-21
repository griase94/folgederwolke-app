/**
 * Pure helpers for bundle.zip filename + folder construction.
 *
 * Extracted from `src/routes/app/jahresabschluss/[year]/bundle.zip/+server.ts`
 * to enable unit testing of umlaut handling, MIME→extension mapping, and the
 * `<businessId>-<slug>.<ext>` shape independently of the route.
 *
 * No DB, no I/O, no env. Safe to import from anywhere.
 */

/**
 * German-aware slugifier. Handles umlauts FIRST so they map to ae/oe/ue
 * (not stripped), then lowercases and collapses non-alphanumerics into
 * dashes. Capped at `maxLen` to keep bundle paths predictable.
 */
export function slugify(s: string, maxLen = 40): string {
  return s
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ßẞ]/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

/**
 * Compute the in-bundle relative path for a Beleg attachment.
 * Layout (Phase 9 Task 18, spec v2.1 §7.4 — German folder names):
 *   ausgaben/{sphere}/{business_id}-{slug}.{ext}
 *   einnahmen/{sphere}/{business_id}-{slug}.{ext}
 *   spenden/{business_id}-{slug}.{ext}     (Spenden have no sphere subfolder)
 *
 * The `09_Belege-{year}/` prefix is added by `buildJahresabschlussBundle()`
 * in `bundle.ts`; this helper returns the relative path inside that folder.
 */
export function bundlePath(row: {
  businessId: string;
  ownerKind: "expense" | "income" | "donation";
  sphere?: string | null;
  bezeichnung?: string | null;
  ext: string;
}): string {
  const slug = slugify(row.bezeichnung ?? "");
  const sphereFolder = row.sphere ?? "ohne-sphaere";
  const folderByKind: Record<typeof row.ownerKind, string> = {
    expense: `ausgaben/${sphereFolder}`,
    income: `einnahmen/${sphereFolder}`,
    donation: "spenden",
  };
  const tail = slug ? `${row.businessId}-${slug}` : row.businessId;
  return `${folderByKind[row.ownerKind]}/${tail}.${row.ext}`;
}

/**
 * Map a MIME type to a sensible file extension. Falls back to `bin`
 * if the type is unknown — better than stripping the extension entirely
 * because the Steuerberater can still open it manually.
 */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
  };
  return map[mime.toLowerCase()] ?? "bin";
}
