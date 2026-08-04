/**
 * /app/jahresabschluss/[year]/gobd-export — GoBD-Z3 IDEA-XML download page.
 *
 * Provides a dedicated download page for the Steuerberater-friendly GoBD-Z3
 * XML export (separate from the full ZIP bundle).
 */

import { error } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import {
  isYearClosed,
  readFestschreibungMeta,
} from "$lib/server/domain/jahresabschluss.js";
import { bundleManifest } from "$lib/server/eur/bundle-manifest.js";

export const load: PageServerLoad = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  // Count rows for display. The Spenden count MUST exclude Storno originals
  // (supersedes_id IS NULL) to match the transaction feed's Art-count — the feed
  // now filters supersedes too (buildSpendenWhere), and the @aurora-impl-d-abschluss
  // e2e asserts gobd-counter == Art-count. Without this the identity breaks in a
  // Storno year.
  // The Mitgliedsbeitrags count mirrors the journal's fourth Art (S1): the
  // GoBD-Z3 XML emits an `<Art>Mitgliedsbeitrag</Art>` record per paid Beitrag,
  // so a "Paket-Inhalt" that names only Einnahmen/Ausgaben/Spenden describes a
  // package it no longer matches — the §4.5 Manifest-Lüge, one level up from
  // the filename it already guards. Predicates are the journal's own: realized
  // cashflow, bucketed by the Zufluss year (S2), never by the Beitragsjahr.
  const counts = await db.execute<{
    einnahmen: string;
    ausgaben: string;
    spenden: string;
    beitraege: string;
  }>(sql`
    SELECT
      (SELECT count(*)::text FROM v_eur_year WHERE year_of_buchung = ${year} AND art = 'income')  AS einnahmen,
      (SELECT count(*)::text FROM v_eur_year WHERE year_of_buchung = ${year} AND art = 'expense') AS ausgaben,
      (SELECT count(*)::text FROM donations WHERE year_of_buchung = ${year} AND supersedes_id IS NULL) AS spenden,
      (SELECT count(*)::text FROM member_beitrags
        WHERE EXTRACT(YEAR FROM gezahlt_am)::int = ${year}
          AND gezahlt_am IS NOT NULL AND paid_cents > 0) AS beitraege
  `);

  const { name: vereinName } = await readStammdaten();

  const einnahmen = parseInt(counts[0]?.einnahmen ?? "0", 10);
  const ausgaben = parseInt(counts[0]?.ausgaben ?? "0", 10);
  const spenden = parseInt(counts[0]?.spenden ?? "0", 10);
  const beitraege = parseInt(counts[0]?.beitraege ?? "0", 10);

  const closed = await isYearClosed(year);

  return {
    year,
    vereinName,
    counts: { einnahmen, ausgaben, spenden, beitraege },
    // D-Flow §Stufe-0 (e): the screen needs the close state + whether there is
    // anything to export, and renders the ZIP contents from the single-source
    // manifest (never a hardcoded filename — §4.5 Manifest-Lüge guard).
    closed,
    hasBuchungen: einnahmen + ausgaben + spenden + beitraege > 0,
    manifest: bundleManifest(year),
    // festgeschrieben am · durch wen — for the Trust-Block meta (§2.6).
    festMeta: closed ? await readFestschreibungMeta(year) : null,
  };
};
