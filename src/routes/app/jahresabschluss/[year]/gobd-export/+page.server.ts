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

  // Count rows for display
  const counts = await db.execute<{
    einnahmen: string;
    ausgaben: string;
    spenden: string;
  }>(sql`
    SELECT
      (SELECT count(*)::text FROM v_eur_year WHERE year_of_buchung = ${year} AND art = 'income')  AS einnahmen,
      (SELECT count(*)::text FROM v_eur_year WHERE year_of_buchung = ${year} AND art = 'expense') AS ausgaben,
      (SELECT count(*)::text FROM donations WHERE year_of_buchung = ${year})                       AS spenden
  `);

  const { name: vereinName } = await readStammdaten();

  const einnahmen = parseInt(counts[0]?.einnahmen ?? "0", 10);
  const ausgaben = parseInt(counts[0]?.ausgaben ?? "0", 10);
  const spenden = parseInt(counts[0]?.spenden ?? "0", 10);

  const closed = await isYearClosed(year);

  return {
    year,
    vereinName,
    counts: { einnahmen, ausgaben, spenden },
    // D-Flow §Stufe-0 (e): the screen needs the close state + whether there is
    // anything to export, and renders the ZIP contents from the single-source
    // manifest (never a hardcoded filename — §4.5 Manifest-Lüge guard).
    closed,
    hasBuchungen: einnahmen + ausgaben + spenden > 0,
    manifest: bundleManifest(year),
    // festgeschrieben am · durch wen — for the Trust-Block meta (§2.6).
    festMeta: closed ? await readFestschreibungMeta(year) : null,
  };
};
