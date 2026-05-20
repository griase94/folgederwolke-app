/**
 * /app/jahresabschluss/[year]/uebersicht — explicit Übersicht tab route.
 *
 * Festschreibung action mirrors the bare-[year] route's action so users
 * landing on /uebersicht directly can still submit the form.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { closeBuchhaltungsjahr } from "$lib/server/domain/jahresabschluss.js";

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
