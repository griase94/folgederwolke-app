/**
 * GET /app/jahresabschluss/[year]/bundle.zip
 *
 * Streams the Jahresabschluss ZIP bundle containing:
 *   - EÜR PDF
 *   - Anlage Gem CSV
 *   - Spendenliste CSV
 *   - Beleg-Index CSV
 *   - GoBD-Z3 IDEA-XML folder
 */

import { error } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { computeEurYear } from "$lib/server/domain/eur.js";
import type { SpendenlisteRow } from "$lib/server/export/spendenliste-csv.js";
import type { BelegIndexRow } from "$lib/server/export/beleg-index.js";
import {
  buildJahresabschlussBundle,
  type BescheinigungAttachment,
  type AuditLogSliceRow,
  type MemberBeitragRow,
  type BelegAttachment,
} from "$lib/server/export/bundle.js";
import { generateEurPdf } from "$lib/server/export/eur-pdf.js";
import { loadEurAggregatesForPdf } from "$lib/server/eur/load.js";
import { getFileStorage } from "$lib/server/files/storage.js";
import { env } from "$lib/server/env.js";

// Phase 9 Task 18 — bundling many Belege can exceed Vercel's default 10s
// Hobby timeout on Fluid Compute. Bumping to 60s gives even large years
// plenty of headroom. (Has no effect outside of Vercel.)
export const config = { maxDuration: 60 };

/**
 * German-aware slugifier. Handles umlauts FIRST so they map to ae/oe/ue
 * (not stripped), then lowercases and collapses non-alphanumerics into
 * dashes. Capped at `maxLen` to keep bundle paths predictable.
 */
function slugify(s: string, maxLen = 40): string {
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
 * Layout (Phase 9 Task 18):
 *   expenses/{sphere}/{business_id}-{slug}.{ext}
 *   income/{sphere}/{business_id}-{slug}.{ext}
 *   donations/{business_id}-{slug}.{ext}   (donations have no sphere subfolder)
 */
function bundlePath(row: {
  businessId: string;
  ownerKind: "expense" | "income" | "donation";
  sphere?: string | null;
  bezeichnung?: string | null;
  ext: string;
}): string {
  const slug = slugify(row.bezeichnung ?? "");
  const sphereFolder = row.sphere ?? "ohne-sphaere";
  const folderByKind: Record<typeof row.ownerKind, string> = {
    expense: `expenses/${sphereFolder}`,
    income: `income/${sphereFolder}`,
    donation: "donations",
  };
  const tail = slug ? `${row.businessId}-${slug}` : row.businessId;
  return `${folderByKind[row.ownerKind]}/${tail}.${row.ext}`;
}

/**
 * Map a MIME type to a sensible file extension. Falls back to `bin`
 * if the type is unknown — better than stripping the extension entirely
 * because the Steuerberater can still open it manually.
 */
function extFromMime(mime: string): string {
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

interface DonationRow {
  business_id: string;
  zugewendet_am: string | null;
  betrag_cents: bigint;
  spende_kind: string;
  zweckbindung_kind: string;
  zweckbindung_text: string | null;
  spender_name: string | null;
  spender_adresse: string | null;
  spender_email: string | null;
  member_name: string | null;
  bescheinigung_nr: string | null;
  bescheinigung_ausgestellt_am: string | null;
  kategorie_name_snapshot: string;
  sphere_snapshot: string;
}

export const GET: RequestHandler = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  // 1. Fetch EÜR rows + compute aggregates.
  //
  // C1 cycle 3 NEW-1: the embedded EÜR PDF MUST report identical Einnahmen
  // totals to the workspace UI. The shared `loadEurAggregatesForPdf` runs
  // the 3-source union (income + donations + member_beitrags) so the PDF
  // matches Übersicht byte-for-byte on the totals.
  //
  // Separately, the Anlage-Gem-CSV and the GoBD-Z3 XML rely on the *non*-
  // union row arrays (with eur_zeile + anlage_gem_zeile from the kategorien
  // JOIN). Donations + Mitgliedsbeiträge have no eur_zeile / anlage_gem_zeile
  // and have their own dedicated bundle exports (03_Spendenliste,
  // 08_Mitgliedsbeitraege). We therefore keep a second non-union `eurForRows`
  // for those two consumers.
  const {
    eur: eurForPdf,
    vereinName,
    einnahmenRowsWithKategorien: einnahmen,
    ausgabenRowsWithKategorien: ausgaben,
  } = await loadEurAggregatesForPdf(year);
  const eur = computeEurYear(year, einnahmen, ausgaben);

  // 2. Fetch Spenden
  const rawDonationRows = await db.execute(sql`
    SELECT
      d.business_id,
      d.zugewendet_am::text,
      d.betrag_cents,
      d.spende_kind,
      d.zweckbindung_kind,
      d.zweckbindung_text,
      d.spender_name,
      d.spender_adresse,
      d.spender_email,
      concat_ws(' ', m.vorname, m.nachname) AS member_name,
      d.bescheinigung_nr,
      d.bescheinigung_ausgestellt_am::text,
      d.kategorie_name_snapshot,
      d.sphere_snapshot
    FROM donations d
    LEFT JOIN members m ON m.id = d.member_id
    WHERE d.year_of_buchung = ${year}
    ORDER BY d.gebucht_am ASC
  `);
  const donationRows = rawDonationRows as unknown as DonationRow[];

  const spenden: SpendenlisteRow[] = donationRows.map((r) => ({
    businessId: r.business_id,
    zugewendetAm: r.zugewendet_am ? new Date(r.zugewendet_am) : null,
    betragCents: BigInt(r.betrag_cents),
    spendeKind: r.spende_kind,
    zweckbindungKind: r.zweckbindung_kind,
    zweckbindungText: r.zweckbindung_text,
    spenderName: r.spender_name,
    spenderAdresse: r.spender_adresse,
    spenderEmail: r.spender_email,
    memberName: r.member_name,
    bescheinigungNr: r.bescheinigung_nr,
    bescheinigungAusgestelltAm: r.bescheinigung_ausgestellt_am
      ? new Date(r.bescheinigung_ausgestellt_am)
      : null,
    kategorieName: r.kategorie_name_snapshot,
    sphereSnapshot: r.sphere_snapshot,
  }));

  // 3. Belege index (expenses with beleg). Phase 9 Task 18: bundlePath
  // is filled later (after the file fetch loop) so the CSV's
  // "Beleg-Pfad (im Bundle)" column references the actual in-bundle
  // location for any expense whose Beleg got embedded under
  // `09_Belege-{year}/`.
  const belege: BelegIndexRow[] = ausgaben
    .filter((r) => r.belegDriveFileId)
    .map((r) => ({
      businessId: r.businessId,
      gebuchtAm: r.gebuchtAm,
      bezeichnung: r.bezeichnung,
      betragCents: r.betragCents,
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      // FIXME(Phase 9 follow-up: backfill drive→blob) — wire belegFileId
      // through `loadEurAggregatesForPdf` so the bundle's Beleg-Link column
      // gets `/api/files/{id}/blob` URLs. Today the loader only projects
      // `belegDriveFileId`; once that column is dropped (PR2), we backfill
      // by joining `expenses.beleg_file_id` instead.
      belegFileId: null,
      belegDriveFileId: r.belegDriveFileId,
      belegOriginalName: r.belegOriginalName,
      bundlePath: null,
    }));

  // 4. Generate EÜR PDF — use the union-based aggregates so the embedded
  //    PDF matches the workspace Übersicht (C1 cycle 3 NEW-1).
  const eurPdfBytes = await generateEurPdf(eurForPdf, vereinName);

  // C1-M3 — Bescheinigung PDFs: load any donations with a stored
  // bescheinigung_pdf_drive_file_id and pull the bytes via FileStorage.
  // Failures are non-fatal (one missing file shouldn't break the bundle).
  const storage = await getFileStorage();
  const bescheinigungRows = (await db.execute(sql`
    SELECT business_id, bescheinigung_nr, bescheinigung_pdf_drive_file_id
      FROM donations
     WHERE year_of_buchung = ${year}
       AND bescheinigung_pdf_drive_file_id IS NOT NULL
       AND supersedes_id IS NULL
  `)) as unknown as Array<{
    business_id: string;
    bescheinigung_nr: string | null;
    bescheinigung_pdf_drive_file_id: string;
  }>;
  const bescheinigungPdfs: BescheinigungAttachment[] = [];
  for (const r of bescheinigungRows) {
    try {
      const bytes = await storage.download(r.bescheinigung_pdf_drive_file_id);
      const nrPart = r.bescheinigung_nr ?? r.business_id;
      bescheinigungPdfs.push({
        filename: `Zuwendungsbestaetigung_${nrPart.replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`,
        bytes,
      });
    } catch (e) {
      // Non-fatal — log a warning and continue. (No-console rule isn't
      // configured project-wide; this is route-level diagnostics.)
      console.warn(
        `bundle: failed to fetch Bescheinigung-PDF for donation ${r.business_id}: ${String(e)}`,
      );
    }
  }

  // C1-M3 — Audit-log slice for the year (Europe/Berlin).
  const auditRows = (await db.execute(sql`
    SELECT a.occurred_at::text AS occurred_at,
           a.actor_kind,
           COALESCE(u.name, u.email, 'system') AS actor_display,
           a.action,
           a.entity_kind,
           a.entity_business_id,
           COALESCE(a.payload::text, '') AS payload
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE a.occurred_at >= (${year}::text || '-01-01 00:00:00')::timestamptz AT TIME ZONE 'Europe/Berlin'
       AND a.occurred_at <  ((${year} + 1)::text || '-01-01 00:00:00')::timestamptz AT TIME ZONE 'Europe/Berlin'
     ORDER BY a.occurred_at ASC
  `)) as unknown as Array<{
    occurred_at: string;
    actor_kind: string;
    actor_display: string;
    action: string;
    entity_kind: string;
    entity_business_id: string | null;
    payload: string;
  }>;
  const auditLogSlice: AuditLogSliceRow[] = auditRows.map((r) => ({
    occurredAt: r.occurred_at,
    actorKind: r.actor_kind,
    actorDisplay: r.actor_display,
    action: r.action,
    entityKind: r.entity_kind,
    entityBusinessId: r.entity_business_id,
    payload: r.payload,
  }));

  // C1-M3 — Paid Mitgliedsbeiträge for the year.
  const beitragRows = (await db.execute(sql`
    SELECT concat_ws(' ', m.vorname, m.nachname) AS member_name,
           mb.year, mb.betrag_cents, mb.paid_cents,
           mb.gezahlt_am::text AS gezahlt_am
      FROM member_beitrags mb
      JOIN members m ON m.id = mb.member_id
     WHERE mb.year = ${year}
       AND mb.paid_cents > 0
     ORDER BY m.nachname ASC, m.vorname ASC
  `)) as unknown as Array<{
    member_name: string;
    year: number;
    betrag_cents: bigint;
    paid_cents: bigint;
    gezahlt_am: string | null;
  }>;
  const memberBeitrags: MemberBeitragRow[] = beitragRows.map((r) => ({
    memberName: r.member_name,
    year: r.year,
    betragCents: BigInt(r.betrag_cents),
    paidCents: BigInt(r.paid_cents),
    gezahltAm: r.gezahlt_am,
  }));

  // Phase 9 Task 18 — Beleg attachments.
  //
  // Query every file linked to an expense / income / donation in this
  // year via beleg_file_id. We join all three owner tables in a single
  // round-trip; per row exactly one owner column is non-null because the
  // app enforces a 1:1 mapping (the trigger from migration 0015 won't
  // permit a file to be referenced from more than one entity in the
  // same year). Soft-deleted files are excluded; archived files are
  // included (their storage_key is at `archived/...` and
  // storage.download() resolves any pathname).
  //
  // NOTE: Rechnungen are deferred (Phase 9 scope intentionally excludes
  // them — invoice attachments will be added in a follow-up phase).
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
      COALESCE(d.spender_name, d.kategorie_name_snapshot) AS donation_bezeichnung
    FROM files f
    LEFT JOIN expenses  e ON e.beleg_file_id = f.id AND e.year_of_buchung = ${year}
    LEFT JOIN income    i ON i.beleg_file_id = f.id AND i.year_of_buchung = ${year}
    LEFT JOIN donations d ON d.beleg_file_id = f.id AND d.year_of_buchung = ${year}
    WHERE f.year_of_buchung = ${year}
      AND f.deleted_at IS NULL
      AND (e.id IS NOT NULL OR i.id IS NOT NULL OR d.id IS NOT NULL)
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
  }>;

  const belegAttachments: BelegAttachment[] = [];
  // Map<business_id, bundlePath> so the Beleg-Index CSV can reference the
  // in-bundle location alongside (or instead of) the legacy Drive link.
  const bundlePathByBusinessId = new Map<string, string>();

  for (const r of belegRows) {
    let ownerKind: "expense" | "income" | "donation";
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
      belegAttachments.push({ bundlePath: path, bytes });
      bundlePathByBusinessId.set(businessId, path);
    } catch (e) {
      console.warn(
        `bundle: failed to fetch Beleg for ${ownerKind} ${businessId} (file ${r.file_id}): ${String(e)}`,
      );
    }
  }

  // Backfill bundlePath into the Beleg-Index rows so the CSV references
  // the in-bundle location for embedded files.
  for (const row of belege) {
    const path = bundlePathByBusinessId.get(row.businessId);
    if (path) row.bundlePath = path;
  }

  // 5. Build ZIP
  const zipBuffer = await buildJahresabschlussBundle({
    year,
    eur,
    eurPdfBytes,
    spenden,
    belege,
    vereinName,
    vereinSteuernummer: env.VEREIN_STEUERNUMMER || undefined,
    includeGobdZ3: true,
    bescheinigungPdfs,
    auditLogSlice,
    memberBeitrags,
    belegAttachments,
  });

  const filename = `Jahresabschluss-${year}.zip`;

  return new Response(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.length),
      "Cache-Control": "no-store",
    },
  });
};
