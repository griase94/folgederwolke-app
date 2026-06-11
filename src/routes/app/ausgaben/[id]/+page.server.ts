/**
 * /app/ausgaben/[id] — Ausgabe detail + edit (Phase 4, Tier C1, Task 5).
 *
 * load(): getTransactionDetail(id, "expense") — now carries belegFileId /
 *         belegMimeType / belegOriginalName (Phase 3 Task 4) for the BelegViewer
 *         — plus zahlungsarten + isFestgeschrieben (the shell renders read-only
 *         when sealed).
 *
 * actions:
 *   ?/save      — festschreibung-gated inline UPDATE of the editable fields.
 *                 There is NO exported `updateExpense`, so the inline
 *                 `db.update(expenses)` is ported here from the legacy
 *                 transactions/[id] route (same SET shape + audit emit).
 *   ?/mark-paid — markExpenseAsPaid(id, { datum, zahlartId, actorUserId })
 *                 (POSITIONAL, no-mail path) behind the festschreibung gate.
 *   ?/duplicate — build a prefill from the DESCRIPTIVE fields ONLY and RESET the
 *                 payment state (no erstattetAm / zahlungsartId / status, never a
 *                 Beleg). The critical recurring-Miete safety (spec §7.2): a
 *                 duplicated Miete must start unpaid, with no carried receipt.
 */

import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import { isoCalendarDate } from "$lib/domain/date.js";
import { errorsFromIssues } from "$lib/domain/zod-errors.js";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  getTransactionDetail,
  markExpenseAsPaid,
  checkFestschreibungGate,
  listZahlungsarten,
  resolveKategorieByName,
} from "$lib/server/domain/transactions.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { and, eq, isNull } from "drizzle-orm";
import { bus } from "$lib/server/events/index.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params }) => {
  const detail = await getTransactionDetail(params.id, "expense");
  if (!detail) {
    error(404, "Ausgabe nicht gefunden");
  }
  const db = getDb();
  const [zahlungsarten, expenseKategorien, allProjects] = await Promise.all([
    listZahlungsarten(),
    listKategorieOptions("expense"),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.name),
  ]);
  const isFestgeschrieben = detail.festgeschriebenAt !== null;
  return {
    detail,
    zahlungsarten,
    expenseKategorien,
    projects: allProjects,
    isFestgeschrieben,
  };
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const saveSchema = z.object({
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  rechnungsdatum: isoCalendarDate.nullable().optional(),
  kommentar: z.string().max(2000).nullable().optional(),
  // Mandatory Kategorie (mirrors the create schema): the picker drives the
  // Sphäre STRICTLY (§4.5), so an empty / sentinel Kategorie is rejected here —
  // we never persist an uncategorized booking from the edit surface either.
  kategorieNameSnapshot: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => v !== "(Unkategorisiert)", {
      message: "Kategorie muss ausgewählt werden",
    }),
  // NOTE: `sphereSnapshot` is intentionally NOT in this schema — it is DERIVED
  // server-side from the Kategorie (§4.5); a body value is never trusted.
  // NOTE: `zahlungsartId` / `erstattetAm` / `status` are intentionally NOT in
  // this schema either — ?/save is a DESCRIPTIVE-ONLY partial update. The
  // payment state is owned by the mark-paid / Erstattung workflow, never by the
  // edit form (which posts no zahlungsartId → a `?? null` here would silently
  // wipe an already-booked reimbursement's payment method, Fix 1).
  projectId: z.string().uuid().nullable().optional(),
});

const markPaidSchema = z.object({
  datum: isoCalendarDate,
  zahlartId: z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions = {
  save: async ({ request, params, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const raw = Object.fromEntries(data);
    const parsed = saveSchema.safeParse({
      ...raw,
      rechnungsdatum: raw.rechnungsdatum || null,
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

    // Festschreibung gate — both the row-level seal AND the settings-based gate.
    const detail = await getTransactionDetail(params.id, "expense");
    if (!detail) return fail(404, { error: "Nicht gefunden" });
    if (detail.festgeschriebenAt) {
      return fail(409, { error: "Jahr ist festgeschrieben" });
    }
    const gate = await checkFestschreibungGate(
      detail.yearOfBuchung ?? new Date().getFullYear(),
    );
    if (!gate.ok) return fail(gate.status, { error: gate.error });

    // §4.5: re-resolve the Kategorie by NAME and derive sphere STRICTLY from it.
    // The body's sphereSnapshot is never trusted (mirrors createExpense) — a
    // tampered/stale sphere can't mis-classify the booking.
    const kat = await resolveKategorieByName(
      "expense",
      parsed.data.kategorieNameSnapshot,
    );

    // Payment-state guard (Fix 2): once an Auslage is `erstattet` the money has
    // moved, so the tax-relevant axes (Betrag + Kategorie/Sphäre) are frozen —
    // a correction must go through Storno, not a silent edit. Descriptive-only
    // edits (Bezeichnung / Kommentar / Datum / Projekt) on an erstattet row stay
    // allowed (and preserve the booked Zahlungsart, Fix 1). We compare the
    // submitted Betrag/Kategorie against the stored values and reject a CHANGE.
    if (detail.status === "erstattet") {
      const betragChanged = parsed.data.betragCents !== detail.betragCents;
      const kategorieChanged = kat.name !== detail.kategorieNameSnapshot;
      if (betragChanged || kategorieChanged) {
        return fail(409, {
          error:
            "Betrag und Kategorie einer erstatteten Auslage sind festgelegt — Korrektur nur über Storno.",
        });
      }
    }

    const db = getDb();
    await db
      .update(expenses)
      // DESCRIPTIVE-ONLY whitelist (Fix 1): never write zahlungsartId /
      // erstattetAm / status here — those belong to the payment workflow.
      .set({
        bezeichnung: parsed.data.bezeichnung,
        betragCents: BigInt(parsed.data.betragCents),
        rechnungsdatum: parsed.data.rechnungsdatum ?? null,
        kommentar: parsed.data.kommentar ?? null,
        kategorieId: kat.id,
        kategorieNameSnapshot: kat.name,
        sphereSnapshot: kat.sphere,
        projectId: parsed.data.projectId ?? null,
        updatedAt: new Date(),
      })
      // TOCTOU: guard the write atomically with the read-gate by re-asserting
      // `festgeschrieben_at IS NULL` in the WHERE (mirrors unmark-erstattet), so
      // a concurrent Festschreibung between the SELECT above and this UPDATE
      // cannot slip an edit into a now-sealed row.
      .where(
        and(eq(expenses.id, params.id), isNull(expenses.festgeschriebenAt)),
      );

    await bus.emit("expense.updated", {
      id: params.id,
      actorUserId: user.id,
      payload: {
        bezeichnung: parsed.data.bezeichnung,
        betragCents: parsed.data.betragCents,
      },
    });

    return { ok: true, saved: true };
  },

  "mark-paid": async ({ request, params, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const parsed = markPaidSchema.safeParse({
      datum: data.get("datum"),
      zahlartId: data.get("zahlartId") || null,
    });
    if (!parsed.success) {
      return fail(422, { error: "Ungültige Eingabe" });
    }

    // Festschreibung gate before mutating (markExpenseAsPaid also row-checks,
    // but the settings gate must run for the pre-close window too).
    const detail = await getTransactionDetail(params.id, "expense");
    if (!detail) return fail(404, { error: "Nicht gefunden" });
    const gate = await checkFestschreibungGate(
      detail.yearOfBuchung ?? new Date().getFullYear(),
    );
    if (!gate.ok) return fail(gate.status, { error: gate.error });

    // Positional, no-mail path (kebab/detail quick action).
    const result = await markExpenseAsPaid(params.id, {
      datum: parsed.data.datum,
      zahlartId: parsed.data.zahlartId ?? null,
      actorUserId: user.id,
    });
    if (!result.ok) return fail(409, { error: result.error });
    return { ok: true, paid: true };
  },

  duplicate: async ({ params, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const detail = await getTransactionDetail(params.id, "expense");
    if (!detail) return fail(404, { error: "Nicht gefunden" });

    // Carry ONLY the descriptive fields; RESET the payment state (spec §7.2).
    // No erstattetAm / zahlungsartId / status / approvedAt, and NEVER the Beleg
    // (a recurring Miete needs a fresh receipt each period). The bezahlt-von
    // identity carries (it's a description of who pays), but the payment is new.
    const prefill = {
      bezeichnung: detail.bezeichnung,
      betragCents: detail.betragCents,
      kategorieNameSnapshot: detail.kategorieNameSnapshot,
      sphereSnapshot: detail.sphereSnapshot,
      kommentar: detail.kommentar,
      projectId: detail.projectId,
      bezahltVonMemberId: detail.bezahltVonMemberId,
      externName: detail.externName,
      externIban: detail.externIban,
      externEmail: detail.externEmail,
    };

    return { ok: true, prefill };
  },
} satisfies Actions;
