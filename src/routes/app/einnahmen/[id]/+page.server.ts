/**
 * /app/einnahmen/[id] — Einnahme detail + edit (Phase 5 / Task 5, Tier C2).
 *
 * load(): getTransactionDetail(params.id, "income") (now carries
 *         belegFileId/belegMimeType/belegOriginalName from Phase 3 Task 4 +
 *         the income-only `rechnungBusinessId` — the read-only "aus Rechnung
 *         FDW-…" link source). 404 when missing; exposes `isFestgeschrieben`.
 *         `rechnungBusinessId` is read straight off the detail — Einnahmen
 *         NEVER joins `invoices` (Task 4 fence).
 *
 * actions:
 *   ?/save — festschreibung-gated update of the editable income fields
 *            (Bezeichnung / Betrag / Geldeingang / Kategorie+Sphäre / Projekt /
 *            Kommentar). This is the ONLY action — Einnahmen has NO payment
 *            workflow on its own detail (no mark-paid, no duplicate). Sphere is
 *            NOT recomputed here (no kategorie-resolve in the update path); the
 *            edit preserves the existing snapshot unless the kategorie changes,
 *            in which case the submitted kategorie + its picker-derived sphere
 *            are persisted.
 */

import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import { isoCalendarDate } from "$lib/domain/date.js";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  getTransactionDetail,
  checkFestschreibungGate,
  resolveKategorieByName,
} from "$lib/server/domain/transactions.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { getDb } from "$lib/server/db/index.js";
import { income } from "$lib/server/db/schema/income.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { and, eq, isNull } from "drizzle-orm";
import { bus } from "$lib/server/events/index.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params }) => {
  const detail = await getTransactionDetail(params.id, "income");
  if (!detail) {
    error(404, "Einnahme nicht gefunden");
  }

  const db = getDb();
  const [incomeKategorien, allProjects] = await Promise.all([
    listKategorieOptions("income"),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.name),
  ]);
  const kategorien = incomeKategorien.map((k) => ({
    name: k.name,
    sphere: k.sphere,
  }));

  const isFestgeschrieben = detail.festgeschriebenAt !== null;

  return { detail, isFestgeschrieben, kategorien, projects: allProjects };
};

// ---------------------------------------------------------------------------
// Schema — editable income fields.
// ---------------------------------------------------------------------------

const saveIncomeSchema = z.object({
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  geldEingangDatum: isoCalendarDate.nullable().optional(),
  kategorieNameSnapshot: z.string().max(200).optional(),
  // NOTE: `sphereSnapshot` is intentionally NOT accepted from the client (§4.5 —
  // the Sphäre is strictly DERIVED from the Kategorie server-side; a tampered or
  // stale client value must never decouple sphere from Kategorie + mis-bucket
  // the EÜR). It is re-resolved below via resolveKategorieByName.
  projectId: z.string().uuid().nullable().optional(),
  kommentar: z.string().max(2000).nullable().optional(),
});

/** Map Zod issues → per-field error messages (first message wins per field). */
function errorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    if (!errors[key]) errors[key] = [issue.message];
  }
  return errors;
}

// ---------------------------------------------------------------------------
// actions — ONLY `save` (no mark-paid, no duplicate).
// ---------------------------------------------------------------------------

export const actions = {
  save: async ({ request, params, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const raw = Object.fromEntries(data);
    const parsed = saveIncomeSchema.safeParse({
      ...raw,
      geldEingangDatum: raw.geldEingangDatum || null,
      kommentar: raw.kommentar || null,
      projectId: raw.projectId || null,
    });
    if (!parsed.success) {
      return fail(422, {
        error: "Ungültige Eingabe",
        errors: errorsFromIssues(parsed.error.issues),
        issues: parsed.error.issues,
      });
    }

    const detail = await getTransactionDetail(params.id, "income");
    if (!detail) return fail(404, { error: "Nicht gefunden" });

    // Festschreibung gate — both the row-level stamp AND the year gate.
    if (detail.festgeschriebenAt) {
      return fail(409, { error: "Jahr ist festgeschrieben" });
    }
    const gate = await checkFestschreibungGate(
      detail.yearOfBuchung ?? new Date().getFullYear(),
    );
    if (!gate.ok) return fail(gate.status, { error: gate.error });

    const db = getDb();
    // NOTE: getTransactionDetail (Phase 3, read-only) does not currently
    // project `geld_eingang_datum`, so the detail form cannot pre-fill it.
    // To avoid wiping an existing Geldeingang on every save, we only WRITE
    // `geldEingangDatum` when the user actually submitted a value (a blank
    // field leaves the stored value untouched). See the BLOCKER note in the
    // phase report: the proper fix is to add `geldEingangDatum` to the income
    // branch of `getTransactionDetail` (Phase-3-owned).
    const geldUpdate =
      parsed.data.geldEingangDatum != null
        ? { geldEingangDatum: parsed.data.geldEingangDatum }
        : {};

    // §4.5 — re-derive the Sphäre from the (possibly changed) Kategorie
    // server-side; never trust a client-posted sphere. Mirrors createIncome +
    // the Ausgaben detail ?/save.
    const kat = await resolveKategorieByName(
      "income",
      parsed.data.kategorieNameSnapshot ?? detail.kategorieNameSnapshot,
    );

    await db
      .update(income)
      .set({
        bezeichnung: parsed.data.bezeichnung,
        betragCents: BigInt(parsed.data.betragCents),
        ...geldUpdate,
        kategorieId: kat.id,
        kategorieNameSnapshot: kat.name,
        sphereSnapshot: kat.sphere,
        projectId: parsed.data.projectId ?? null,
        kommentar: parsed.data.kommentar ?? null,
        updatedAt: new Date(),
      })
      // Atomic festschreibung guard (TOCTOU): only write if still not
      // festgeschrieben — mirrors the Ausgaben save + unmark-erstattet.
      .where(and(eq(income.id, params.id), isNull(income.festgeschriebenAt)));

    await bus.emit("income.updated", {
      id: params.id,
      actorUserId: user.id,
      payload: {
        bezeichnung: parsed.data.bezeichnung,
        betragCents: parsed.data.betragCents,
      },
    });

    return { ok: true, saved: true };
  },
} satisfies Actions;
