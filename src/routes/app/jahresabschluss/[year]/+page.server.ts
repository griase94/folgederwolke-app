/**
 * /app/jahresabschluss/[year]/+page.server.ts
 *
 * The tabbed workspace's default landing tab is Übersicht. The bare
 * /app/jahresabschluss/[year] URL renders that tab inline so existing
 * deep-links (and the @phase-6 jahresabschluss e2e tests) keep working
 * without an extra redirect roundtrip.
 *
 * Workspace data is loaded by +layout.server.ts and inherited here.
 * The Festschreibung action is also reachable via this route's URL.
 */

import { fail, error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { closeBuchhaltungsjahr } from "$lib/server/domain/jahresabschluss.js";
import { archiveYear } from "$lib/server/files/archive-job.js";
import { berlinYear } from "$lib/domain/year.js";

export const load: PageServerLoad = async () => {
  // All payload comes from +layout.server.ts via inherited `data`.
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

    // Guardrail: the in-progress (current) year — and any future year — cannot
    // be festgeschrieben. The Jahresabschluss is only possible once the year has
    // fully ended (domain enforces this too; this returns the friendly message).
    const currentYear = berlinYear();
    if (year >= currentYear) {
      return fail(409, {
        error: `Das laufende Jahr ${year} kann noch nicht festgeschrieben werden — der Jahresabschluss ist erst nach Jahresende möglich.`,
      });
    }

    try {
      // PHASE 1: archive Phase 9 files first. The files Festschreibung trigger
      // arms once settings.festgeschrieben_bis catches up; today no app code
      // sets that automatically — but running archive first is
      // belt-and-suspenders against any future code path that flips the
      // setting before this action runs. Semantic reason: archive is the
      // preparation step for close.
      const archiveResult = await archiveYear(year);

      // PHASE 2: close the books.
      const result = await closeBuchhaltungsjahr(year, user.id);
      return {
        success: true,
        year: result.year,
        totalRows: result.totalRows,
        rowsByTable: result.rowsByTable,
        archived: archiveResult.archived,
        archiveFailed: archiveResult.failed,
        archiveTotal: archiveResult.total,
      };
    } catch (err) {
      if (err && typeof err === "object" && "status" in err && "body" in err) {
        // SvelteKit error — re-throw
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      return fail(500, { error: `Festschreibung fehlgeschlagen: ${msg}` });
    }
  },
};
// keep `error` import live for future per-action 404s
void error;
