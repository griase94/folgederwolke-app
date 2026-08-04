/**
 * /portal/profil — the member's own data (A-flow S2b, brief §2.2c).
 *
 * Self-service scope is deliberately ONE field: the IBAN. Name and e-mail are
 * Vereins-Stammdaten — a member changing their own e-mail would silently
 * re-point their login, so those stay read-only with a mailto to the Vorstand.
 *
 * The IBAN write goes through `updateMemberIban`, the same single path the
 * Willkommens-Karte and the Auslagen submit use, so every change is normalized,
 * validated and audit-anchored identically.
 */

import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import {
  updateMemberIban,
  InvalidIbanError,
} from "$lib/server/domain/member-iban.js";
import { IBAN_ERROR_MESSAGE } from "$lib/server/domain/auslagen.js";
import { maskIbanDisplay } from "$lib/domain/iban.js";

export const load: PageServerLoad = async ({ locals }) => {
  // Identity, masked IBAN and the Verein contact address already arrive from
  // the portal layout and the root layout — nothing to load here.
  if (!locals.session?.user.memberId) redirect(303, "/app");
  return {};
};

export const actions: Actions = {
  iban: async ({ request, locals }) => {
    const memberId = locals.session?.user.memberId;
    const userId = locals.session?.user.id;
    if (!memberId || !userId) redirect(303, "/app");

    const form = await request.formData();
    const raw = String(form.get("iban") ?? "").trim();
    if (!raw) return fail(422, { ibanError: IBAN_ERROR_MESSAGE });

    try {
      const { iban } = await getDb().transaction((tx) =>
        updateMemberIban(
          { memberId, rawIban: raw, actorUserId: userId, source: "profil" },
          tx,
        ),
      );
      // Masked only — the stored IBAN never travels back to the client.
      return { ibanSaved: true, maskedIban: maskIbanDisplay(iban) };
    } catch (err) {
      if (err instanceof InvalidIbanError) {
        return fail(422, { ibanError: IBAN_ERROR_MESSAGE });
      }
      throw err;
    }
  },
};
