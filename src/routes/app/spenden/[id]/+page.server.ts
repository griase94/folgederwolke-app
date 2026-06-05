/**
 * /app/spenden/[id] — Spende detail + edit (spec §10 + §9, Phase 6 Task 6).
 *
 *   load:     getTransactionDetail(params.id, "donation") — carries the §4.3
 *             donation fields (zweckbindungText, spenderAdresse,
 *             wertermittlungMethode, zustandBeschreibung, herkunftsbelegFileId)
 *             threaded by Phase 3 Task 4. 404 when missing; exposes
 *             isFestgeschrieben + whether Bescheinigung is enabled/issued.
 *   ?/save:   festschreibung + bescheinigt gate → editSpende (the Task-4
 *             reconciled path; re-derives Kategorie, never touches sphere).
 *   ?/delete: hard-delete pre-Bescheinigung; blocked once bescheinigungNr set OR
 *             festgeschrieben (409) — the rule ported from the retired route.
 *
 * The "Bescheinigung erstellen" action is a plain link in the detail page to the
 * moved /app/spenden/[id]/zuwendungsbestaetigung route (no server action here).
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getTransactionDetail } from "$lib/server/domain/transactions.js";
import {
  editSpende,
  isBescheinigungEnabled,
} from "$lib/server/domain/spenden.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";

export const load: PageServerLoad = async ({ params }) => {
  const detail = await getTransactionDetail(params.id, "donation");
  if (!detail) {
    error(404, "Spende nicht gefunden");
  }
  return {
    detail,
    isFestgeschrieben: detail.festgeschriebenAt !== null,
    bescheinigungEnabled: isBescheinigungEnabled(),
    bescheinigungNr: detail.bescheinigungNr,
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const data = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of data.entries()) raw[k] = v;

    // editSpende enforces the festschreibung + "bereits bescheinigt → 409"
    // guards itself (it re-reads the row) and re-derives the Kategorie.
    const result = await editSpende(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        error: result.error,
        errors: result.errors,
        values: result.values ?? raw,
      });
    }
    return { ok: true };
  },

  delete: async ({ params, locals }) => {
    // Hard-delete pre-Bescheinigung donations (the rule moved here from the
    // retired /app/transactions/spenden route). Once a Bescheinigung is issued
    // OR the year is festgeschrieben, deletion is blocked — Storno in Phase 2.
    void locals;
    const detail = await getTransactionDetail(params.id, "donation");
    if (!detail) return fail(404, { error: "Spende nicht gefunden" });
    if (detail.bescheinigungNr) {
      return fail(409, {
        error:
          "Bescheinigte Spende kann nicht gelöscht werden (Storno in Phase 2)",
      });
    }
    if (detail.festgeschriebenAt) {
      return fail(409, {
        error: "Buchungsjahr ist festgeschrieben (ADR-0006)",
      });
    }
    const db = getDb();
    await db.delete(donations).where(eq(donations.id, params.id));
    redirect(303, "/app/spenden");
  },
};
