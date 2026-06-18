/**
 * /app/jahresabschluss/[year]/uebersicht — explicit Übersicht tab route.
 *
 * Festschreibung action mirrors the bare-[year] route's action so users
 * landing on /uebersicht directly can still submit the form.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { closeBuchhaltungsjahr } from "$lib/server/domain/jahresabschluss.js";
import { berlinYear } from "$lib/domain/year.js";

export const load: PageServerLoad = async () => {
  return {};
};

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
    // Same guardrail as the bare-[year] action: the in-progress/current year
    // (and future) cannot be festgeschrieben — return a friendly 409, not a 500.
    if (year >= berlinYear()) {
      return fail(409, {
        error: `Das laufende Jahr ${year} kann noch nicht festgeschrieben werden — der Jahresabschluss ist erst nach Jahresende möglich.`,
      });
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
