/**
 * Phase 9 — assemble Beleg attachments for the year-end bundle.zip.
 *
 * Extracted from `src/routes/app/jahresabschluss/[year]/bundle.zip/+server.ts`
 * to enable integration testing of the SQL+mapping pipeline that produces
 * `belegAttachments` for `buildJahresabschlussBundle()`:
 *
 *  - `WHERE f.deleted_at IS NULL` — soft-deleted Belege are excluded
 *  - `COALESCE(e.sphere_override, e.sphere_snapshot)` — Project sphere
 *    override (ADR-0008) wins over the snapshot
 *  - `slugify()` German-aware umlauts in `bezeichnung` → ae/oe/ue/ss
 *  - `bundlePath()` routes to ausgaben/einnahmen/spenden by ownerKind
 *
 * No environment access; pure dependency injection of `db` + `storage`.
 */
import { sql } from "drizzle-orm";
import type { getDb as GetDb } from "$lib/server/db/index.js";
import type { FileStorage } from "$lib/server/files/storage.js";
import { bundlePath, extFromMime } from "./bundle-paths.js";
import type { BelegAttachment } from "./bundle.js";

type Db = ReturnType<typeof GetDb>;

export interface AssembleBelegAttachmentsResult {
  attachments: BelegAttachment[];
  /** Map<businessId, bundlePath> so the Beleg-Index CSV can reference the in-bundle location. */
  bundlePathByBusinessId: Map<string, string>;
}

/**
 * Run the year-scoped SELECT against `files` joined to
 * `expenses`/`income`/`donations`, map rows to `BelegAttachment` shape,
 * download each file's bytes via `storage`, and return the attachments
 * ready to pass to `buildJahresabschlussBundle()`.
 *
 * Defensive: a file whose `storage.download()` fails is logged and
 * skipped — the rest of the bundle still builds (Phase 9 spec v2.1 §7.4:
 * the bundle should be robust to per-file storage hiccups).
 */
export async function assembleBelegAttachments(args: {
  year: number;
  db: Db;
  storage: FileStorage;
}): Promise<AssembleBelegAttachmentsResult> {
  const { year, db, storage } = args;

  const belegRows = (await db.execute(sql`
    SELECT
      f.id                   AS file_id,
      f.storage_key          AS storage_key,
      f.mime_type            AS mime_type,
      f.original_filename    AS original_filename,
      e.business_id          AS expense_business_id,
      COALESCE(e.sphere_override, e.sphere_snapshot) AS expense_sphere,
      e.bezeichnung          AS expense_bezeichnung,
      i.business_id          AS income_business_id,
      i.sphere_snapshot      AS income_sphere,
      i.bezeichnung          AS income_bezeichnung,
      d.business_id          AS donation_business_id,
      COALESCE(d.spender_name, d.kategorie_name_snapshot) AS donation_bezeichnung,
      inv.business_id        AS invoice_business_id,
      inv.bezeichnung        AS invoice_bezeichnung
    FROM files f
    LEFT JOIN expenses  e   ON e.beleg_file_id   = f.id AND e.year_of_buchung   = ${year}
    LEFT JOIN income    i   ON i.beleg_file_id   = f.id AND i.year_of_buchung   = ${year}
    LEFT JOIN donations d   ON d.beleg_file_id   = f.id AND d.year_of_buchung   = ${year}
    LEFT JOIN invoices  inv ON inv.pdf_file_id   = f.id AND inv.year_of_buchung = ${year}
    WHERE f.year_of_buchung = ${year}
      AND f.deleted_at IS NULL
      AND (e.id IS NOT NULL OR i.id IS NOT NULL OR d.id IS NOT NULL OR inv.id IS NOT NULL)
  `)) as unknown as Array<{
    file_id: string;
    storage_key: string;
    mime_type: string;
    original_filename: string;
    expense_business_id: string | null;
    expense_sphere: string | null;
    expense_bezeichnung: string | null;
    income_business_id: string | null;
    income_sphere: string | null;
    income_bezeichnung: string | null;
    donation_business_id: string | null;
    donation_bezeichnung: string | null;
    invoice_business_id: string | null;
    invoice_bezeichnung: string | null;
  }>;

  const attachments: BelegAttachment[] = [];
  const bundlePathByBusinessId = new Map<string, string>();

  for (const r of belegRows) {
    let ownerKind: "expense" | "income" | "donation" | "invoice";
    let businessId: string;
    let sphere: string | null;
    let bezeichnung: string | null;
    if (r.expense_business_id) {
      ownerKind = "expense";
      businessId = r.expense_business_id;
      sphere = r.expense_sphere;
      bezeichnung = r.expense_bezeichnung;
    } else if (r.income_business_id) {
      ownerKind = "income";
      businessId = r.income_business_id;
      sphere = r.income_sphere;
      bezeichnung = r.income_bezeichnung;
    } else if (r.donation_business_id) {
      ownerKind = "donation";
      businessId = r.donation_business_id;
      sphere = null;
      bezeichnung = r.donation_bezeichnung;
    } else if (r.invoice_business_id) {
      ownerKind = "invoice";
      businessId = r.invoice_business_id;
      sphere = null;
      bezeichnung = r.invoice_bezeichnung;
    } else {
      // Shouldn't happen given the WHERE clause, but skip defensively.
      continue;
    }
    const ext = extFromMime(r.mime_type);
    const path = bundlePath({
      businessId,
      ownerKind,
      sphere,
      bezeichnung,
      ext,
    });
    try {
      const bytes = await storage.download(r.storage_key);
      attachments.push({ bundlePath: path, bytes });
      bundlePathByBusinessId.set(businessId, path);
    } catch (e) {
      console.warn(
        `bundle: failed to fetch Beleg for ${ownerKind} ${businessId} (file ${r.file_id}): ${String(e)}`,
      );
    }
  }

  return { attachments, bundlePathByBusinessId };
}
