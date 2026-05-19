/**
 * /app/jahresabschluss/[year] — EÜR summary + Festschreibung action.
 *
 * load(): queries income + expense rows for the year via v_eur_year,
 *         computes sphere-aggregated EÜR, checks festgeschrieben status.
 *
 * actions:
 *   ?/festschreiben — calls close_buchhaltungsjahr(year, actor_id)
 */

import { error, fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import {
  computeEurYear,
  type EurRow,
  type Sphere,
} from "$lib/server/domain/eur.js";
import {
  closeBuchhaltungsjahr,
  isYearClosed,
} from "$lib/server/domain/jahresabschluss.js";
import { env } from "$lib/server/env.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface VEurYearRow {
  art: string;
  business_id: string;
  gebucht_am: Date;
  year_of_buchung: number;
  betrag_cents: bigint;
  bezeichnung: string;
  sphere_snapshot: string;
  kategorie_id: string | null;
  kategorie_name_snapshot: string;
  eur_zeile: number | null;
  anlage_gem_zeile: number | null;
  beleg_drive_file_id: string | null;
  beleg_original_name: string | null;
  festgeschrieben_at: Date | null;
}

function toEurRow(r: VEurYearRow): EurRow {
  return {
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
  };
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  // Query v_eur_year for all rows of this year
  const rawRows = await db.execute(sql`
    SELECT
      art, business_id, gebucht_am, year_of_buchung, betrag_cents,
      bezeichnung, sphere_snapshot, kategorie_id, kategorie_name_snapshot,
      eur_zeile, anlage_gem_zeile, beleg_drive_file_id, beleg_original_name,
      festgeschrieben_at
    FROM v_eur_year
    WHERE year_of_buchung = ${year}
    ORDER BY gebucht_am ASC
  `);
  const rows = rawRows as unknown as VEurYearRow[];

  const einnahmenRows = rows.filter((r) => r.art === "income").map(toEurRow);
  const ausgabenRows = rows.filter((r) => r.art === "expense").map(toEurRow);

  const eur = computeEurYear(year, einnahmenRows, ausgabenRows);
  const closed = await isYearClosed(year);

  // Spenden count for the download bundle info
  const spendenResult = await db.execute<{ cnt: string }>(sql`
    SELECT count(*)::text AS cnt FROM donations WHERE year_of_buchung = ${year}
  `);
  const spendenCount = parseInt(spendenResult[0]?.cnt ?? "0", 10);

  return {
    year,
    eur: {
      year: eur.year,
      totalEinnahmenCents: Number(eur.totalEinnahmenCents),
      totalAusgabenCents: Number(eur.totalAusgabenCents),
      totalUeberschussCents: Number(eur.totalUeberschussCents),
      bySphere: Object.fromEntries(
        Object.entries(eur.bySphere).map(([sphere, data]) => [
          sphere,
          {
            sphere: data.sphere,
            einnahmenCount: data.einnahmen.length,
            ausgabenCount: data.ausgaben.length,
            einnahmenCents: Number(data.totals.einnahmenCents),
            ausgabenCents: Number(data.totals.ausgabenCents),
            ueberschussCents: Number(data.totals.ueberschussCents),
          },
        ]),
      ),
    },
    closed,
    spendenCount,
    vereinName: env.VEREIN_NAME || "Folge der Wolke e.V.",
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  festschreiben: async ({ params, locals }) => {
    const year = parseInt(params.year, 10);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return fail(400, { error: `Ungültiges Jahr: ${params.year}` });
    }

    const user = locals.session?.user;
    if (!user) {
      return fail(401, { error: "Nicht angemeldet" });
    }

    try {
      const result = await closeBuchhaltungsjahr(year, user.id);
      return {
        success: true,
        year: result.year,
        totalRows: result.totalRows,
        rowsByTable: result.rowsByTable,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(500, { error: `Festschreibung fehlgeschlagen: ${msg}` });
    }
  },
};
