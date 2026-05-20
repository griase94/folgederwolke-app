/**
 * /app/jahresabschluss — index: redirect to the most recent completed year.
 * Lists available years (any year that has income or expense rows).
 */

import { sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { berlinYear } from "$lib/domain/year.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  // Collect distinct years with any bookings, most recent first
  const rows = await db.execute<{ year: number; closed: boolean }>(sql`
    SELECT year_of_buchung AS year,
           bool_and(festgeschrieben_at IS NOT NULL) AS closed
    FROM (
      SELECT year_of_buchung, festgeschrieben_at FROM income
      UNION ALL
      SELECT year_of_buchung, festgeschrieben_at FROM expenses
      UNION ALL
      SELECT year_of_buchung, festgeschrieben_at FROM donations
    ) t
    GROUP BY year_of_buchung
    ORDER BY year_of_buchung DESC
  `);

  const currentYear = berlinYear();

  // Always include current year even if no rows yet
  const yearSet = new Set(rows.map((r) => r.year));
  if (!yearSet.has(currentYear)) {
    rows.unshift({ year: currentYear, closed: false });
  }

  return {
    years: rows.map((r) => ({
      year: r.year,
      closed: Boolean(r.closed),
    })),
  };
};
