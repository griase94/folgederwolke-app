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
} from "$lib/server/export/bundle.js";
import { generateEurPdf } from "$lib/server/export/eur-pdf.js";
import { loadEurAggregatesForPdf } from "$lib/server/eur/load.js";
import { getFileStorage } from "$lib/server/files/storage.js";
import { assembleBelegAttachments } from "$lib/server/export/beleg-attachments.js";
import { env } from "$lib/server/env.js";

// Phase 9 Task 18 — bundling many Belege can exceed Vercel's default 10s
// Hobby timeout on Fluid Compute. Bumping to 60s gives even large years
// plenty of headroom. (Has no effect outside of Vercel.)
export const config = { maxDuration: 60 };

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

  // Phase 9 Task 18 — Beleg attachments. See `assembleBelegAttachments`
  // for the SQL + ownerKind dispatch + bundlePath/extFromMime mapping;
  // extracted so the integration suite can exercise it against the real
  // DB without going through the route. Rechnungen remain deferred
  // (Phase 9 scope intentionally excludes them).
  const { attachments: belegAttachments, bundlePathByBusinessId } =
    await assembleBelegAttachments({ year, db, storage });

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
