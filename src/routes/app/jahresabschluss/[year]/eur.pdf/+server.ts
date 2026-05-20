/**
 * GET /app/jahresabschluss/[year]/eur.pdf  — C1-H4
 *
 * Single-purpose EÜR PDF endpoint, separate from the Steuerberater-Paket
 * bundle.zip. The Quick-Action "PDF drucken (EÜR)" button on the Übersicht
 * tab points here so users get just the one-pager without waiting for the
 * full ZIP build.
 *
 * Reuses the existing `generateEurPdf` template via the same EurYearResult
 * shape used by bundle.zip.
 */

import { error } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import {
  computeEurYear,
  type EurRow,
  type Sphere,
} from "$lib/server/domain/eur.js";
import { generateEurPdf } from "$lib/server/export/eur-pdf.js";
import { env } from "$lib/server/env.js";

interface VEurRow {
  art: string;
  business_id: string;
  gebucht_am: Date;
  betrag_cents: bigint;
  bezeichnung: string;
  sphere_snapshot: string;
  kategorie_id: string | null;
  kategorie_name_snapshot: string;
  eur_zeile: number | null;
  anlage_gem_zeile: number | null;
  beleg_drive_file_id: string | null;
  beleg_original_name: string | null;
}

export const GET: RequestHandler = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();
  const vereinName = env.VEREIN_NAME || "Folge der Wolke e.V.";

  // Use base tables directly — v_eur_year is only granted to app_export
  // (per 0002_roles.sql); the live route runs as app_runtime. Same pattern
  // as loadEurWorkspaceData in $lib/server/eur/load.ts.
  const rawEurRows = await db.execute(sql`
    SELECT 'income' AS art, i.business_id, i.gebucht_am, i.betrag_cents, i.bezeichnung,
           i.sphere_snapshot, i.kategorie_id, i.kategorie_name_snapshot,
           k.eur_zeile, k.anlage_gem_zeile, i.beleg_drive_file_id, i.beleg_original_name
      FROM income i
      LEFT JOIN kategorien k ON k.id = i.kategorie_id
     WHERE i.year_of_buchung = ${year}
    UNION ALL
    SELECT 'expense' AS art, e.business_id, e.gebucht_am, e.betrag_cents, e.bezeichnung,
           COALESCE(e.sphere_override, e.sphere_snapshot),
           e.kategorie_id, e.kategorie_name_snapshot,
           k.eur_zeile, k.anlage_gem_zeile, e.beleg_drive_file_id, e.beleg_original_name
      FROM expenses e
      LEFT JOIN kategorien k ON k.id = e.kategorie_id
     WHERE e.year_of_buchung = ${year}
     ORDER BY gebucht_am ASC
  `);
  const eurRows = rawEurRows as unknown as VEurRow[];

  const mkRow = (r: VEurRow): EurRow => ({
    businessId: r.business_id,
    gebuchtAm: r.gebucht_am,
    betragCents: BigInt(r.betrag_cents),
    sphereSnapshot: r.sphere_snapshot as Sphere,
    kategorieId: r.kategorie_id,
    kategorieNameSnapshot: r.kategorie_name_snapshot,
    eurZeile: r.eur_zeile,
    anlageGemZeile: r.anlage_gem_zeile,
    bezeichnung: r.bezeichnung,
    belegDriveFileId: r.beleg_drive_file_id,
    belegOriginalName: r.beleg_original_name,
  });

  const einnahmen = eurRows.filter((r) => r.art === "income").map(mkRow);
  const ausgaben = eurRows.filter((r) => r.art === "expense").map(mkRow);

  const eur = computeEurYear(year, einnahmen, ausgaben);
  const pdfBytes = await generateEurPdf(eur, vereinName);

  const filename = `EÜR-${year}.pdf`;
  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store",
    },
  });
};
