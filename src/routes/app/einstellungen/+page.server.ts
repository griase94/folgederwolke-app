/**
 * /app/einstellungen — Einstellungen page server load.
 *
 * Exposes read-only VEREIN_* org constants (from env) and the current user
 * so the page can display org info without a DB round-trip.
 */

import type { PageServerLoad } from "./$types.js";
import { env } from "$lib/server/env.js";

export const load: PageServerLoad = ({ locals }) => {
  return {
    user: locals.session!.user,
    verein: {
      name: env.VEREIN_NAME,
      steuernummer: env.VEREIN_STEUERNUMMER,
      vr: env.VEREIN_VR,
      adresse: env.VEREIN_ADRESSE,
      iban: env.VEREIN_IBAN,
      bic: env.VEREIN_BIC,
      bank: env.VEREIN_BANK,
    },
    templateDocId: env.TEMPLATE_DOC_ID,
    mailFrom: env.MAIL_FROM,
  };
};
