/**
 * /app/transactions/spenden - Spenden-tab list.
 *
 * load(): all donations rows joined with kategorie + member display, plus
 *         enough metadata for the SpendenList component (Bescheinigung
 *         status, betrag, project). The route also exposes whether
 *         Bescheinigung-Generierung is enabled (env-gated) so the UI can
 *         disable the action button with a clear reason.
 *
 * actions:
 *   default (?/add)        - createSpende
 *   ?/edit                 - editSpende
 *   ?/delete               - soft-delete via UPDATE (Phase 6 importer-safe;
 *                            v1 we hard-delete because no festschreibung
 *                            yet on Spenden in fixtures).
 *
 * The Aufwandsspende workflow is deferred to Phase 2; the UI surfaces a
 * disabled state with the note "Aufwandsspende-Workflow in Vorbereitung".
 */

import { fail } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { members } from "$lib/server/db/schema/members.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  createSpende,
  editSpende,
  isBescheinigungEnabled,
} from "$lib/server/domain/spenden.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  // Donation rows ----------------------------------------------------------
  const rows = await db
    .select()
    .from(donations)
    .orderBy(desc(donations.gebuchtAm));

  // Kategorien (only kind='income' since Spenden are income-side) ---------
  const kats = await db.select().from(kategorien).orderBy(kategorien.name);

  // Members (for spender selector) ----------------------------------------
  const allMembers = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
      email: members.email,
      adresse: members.adresse,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);

  // Projects (for zweckgebundene Spenden) ---------------------------------
  const allProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      businessId: projects.businessId,
    })
    .from(projects)
    .orderBy(projects.name);

  return {
    bescheinigungEnabled: isBescheinigungEnabled(),
    spenden: rows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      gebuchtAm: r.gebuchtAm.toISOString(),
      zugewendetAm: r.zugewendetAm,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      memberId: r.memberId,
      spenderName: r.spenderName,
      spenderAdresse: r.spenderAdresse,
      spenderEmail: r.spenderEmail,
      spendeKind: r.spendeKind,
      zweckbindungKind: r.zweckbindungKind,
      zweckbindungText: r.zweckbindungText,
      kategorieId: r.kategorieId,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      sphereSnapshot: r.sphereSnapshot,
      projectId: r.projectId,
      bescheinigungNr: r.bescheinigungNr,
      bescheinigungAusgestelltAm: r.bescheinigungAusgestelltAm,
      bescheidTyp: r.bescheidTyp,
      festgeschriebenAt: r.festgeschriebenAt
        ? r.festgeschriebenAt.toISOString()
        : null,
      yearOfBuchung: r.yearOfBuchung ?? null,
    })),
    kategorien: kats
      .filter((k) => k.kind === "income" && !k.deactivated)
      .map((k) => ({
        id: k.id,
        name: k.name,
        sphere: k.sphere,
      })),
    members: allMembers.map((m) => ({
      id: m.id,
      vorname: m.vorname,
      nachname: m.nachname,
      label: `${m.vorname} ${m.nachname}`.trim(),
      email: m.email,
      adresse: m.adresse,
    })),
    projects: allProjects.map((p) => ({
      id: p.id,
      name: p.name,
      businessId: p.businessId,
    })),
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await createSpende(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "add",
        error: result.error,
        errors: result.errors,
        values: result.values,
      });
    }
    return {
      action: "add",
      success: true,
      donationId: result.donationId,
      businessId: result.businessId,
    };
  },

  edit: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await editSpende(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "edit",
        error: result.error,
        errors: result.errors,
        values: result.values,
      });
    }
    return { action: "edit", success: true };
  },

  delete: async ({ request, locals }) => {
    // Hard-delete pre-Bescheinigung donations. Once a Bescheinigung is
    // issued, deletion is blocked (D10) - users must storno via Phase 2.
    const userId = locals.session?.user.id ?? null;
    void userId;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";
    if (!id) return fail(400, { action: "delete", error: "Fehlende ID" });

    const db = getDb();
    const existing = await db
      .select({
        bescheinigungNr: donations.bescheinigungNr,
        festgeschriebenAt: donations.festgeschriebenAt,
      })
      .from(donations)
      .where(eq(donations.id, id))
      .limit(1);
    if (!existing[0]) {
      return fail(404, { action: "delete", error: "Spende nicht gefunden" });
    }
    if (existing[0].bescheinigungNr) {
      return fail(409, {
        action: "delete",
        error:
          "Bescheinigte Spende kann nicht geloescht werden (Storno in Phase 2)",
      });
    }
    if (existing[0].festgeschriebenAt) {
      return fail(409, {
        action: "delete",
        error: "Buchungsjahr ist festgeschrieben (ADR-0006)",
      });
    }
    await db.delete(donations).where(eq(donations.id, id));
    return { action: "delete", success: true };
  },
};
