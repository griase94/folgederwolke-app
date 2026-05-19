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
import {
  computeEurYear,
  type EurRow,
  type Sphere,
} from "$lib/server/domain/eur.js";
import type { SpendenlisteRow } from "$lib/server/export/spendenliste-csv.js";
import type { BelegIndexRow } from "$lib/server/export/beleg-index.js";
import { buildJahresabschlussBundle } from "$lib/server/export/bundle.js";
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
  const vereinName = env.VEREIN_NAME || "Folge der Wolke e.V.";

  // 1. Fetch EÜR rows
  const rawEurRows = await db.execute(sql`
    SELECT art, business_id, gebucht_am, betrag_cents, bezeichnung,
           sphere_snapshot, kategorie_id, kategorie_name_snapshot,
           eur_zeile, anlage_gem_zeile, beleg_drive_file_id, beleg_original_name
    FROM v_eur_year
    WHERE year_of_buchung = ${year}
    ORDER BY gebucht_am ASC
  `);
  const eurRows = rawEurRows as unknown as VEurRow[];

  const einnahmen: EurRow[] = eurRows
    .filter((r) => r.art === "income")
    .map((r) => ({
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
    }));

  const ausgaben: EurRow[] = eurRows
    .filter((r) => r.art === "expense")
    .map((r) => ({
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
    }));

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

  // 3. Belege index (expenses with beleg)
  const belege: BelegIndexRow[] = ausgaben
    .filter((r) => r.belegDriveFileId)
    .map((r) => ({
      businessId: r.businessId,
      gebuchtAm: r.gebuchtAm,
      bezeichnung: r.bezeichnung,
      betragCents: r.betragCents,
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      belegDriveFileId: r.belegDriveFileId,
      belegOriginalName: r.belegOriginalName,
    }));

  // 4. Generate EÜR PDF
  const eurPdfBytes = await generateEurPdf(eur, vereinName);

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
