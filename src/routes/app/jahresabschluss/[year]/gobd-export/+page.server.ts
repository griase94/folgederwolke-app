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

  return {
    year,
    vereinName,
    counts: {
      einnahmen: parseInt(counts[0]?.einnahmen ?? "0", 10),
      ausgaben: parseInt(counts[0]?.ausgaben ?? "0", 10),
      spenden: parseInt(counts[0]?.spenden ?? "0", 10),
    },
  };
};
