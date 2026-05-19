/**
 * /app/transactions/[id] — Transaction detail + edit.
 *
 * load(): returns TransactionDetail (expense | income | donation) +
 *         audit_log timeline + zahlungsarten.
 *
 * Query param: ?kind=expense|income|donation (required to route the query).
 *
 * actions:
 *   ?/save            — update expense (no mail)
 *   ?/save-and-notify — update + markExpenseErstattet (fires ErstattungsMail)
 */

import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  getTransactionDetail,
  checkFestschreibungGate,
  listZahlungsarten,
  type TransactionKind,
} from "$lib/server/domain/transactions.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { eq } from "drizzle-orm";
import { bus } from "$lib/server/events/index.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params, url }) => {
  const kind = (url.searchParams.get("kind") ?? "expense") as TransactionKind;
  const detail = await getTransactionDetail(params.id, kind);
  if (!detail) {
    error(404, "Transaktion nicht gefunden");
  }

  const zahlungsarten = await listZahlungsarten();

  const isFestgeschrieben = detail.festgeschriebenAt !== null;

  return { detail, zahlungsarten, isFestgeschrieben };
};

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const saveExpenseSchema = z.object({
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  rechnungsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  kommentar: z.string().max(2000).nullable().optional(),
  kategorieNameSnapshot: z.string().max(200).optional(),
  sphereSnapshot: z
    .enum(["ideeller", "vermoegen", "zweckbetrieb", "wirtschaftlich"])
    .optional(),
  projectId: z.string().uuid().nullable().optional(),
  zahlungsartId: z.string().uuid().nullable().optional(),
  erstattetAm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions = {
  save: async ({ request, params, url, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const kind = (url.searchParams.get("kind") ?? "expense") as TransactionKind;

    const data = await request.formData();
    const raw = Object.fromEntries(data);

    if (kind === "expense") {
      const parsed = saveExpenseSchema.safeParse({
        ...raw,
        rechnungsdatum: raw.rechnungsdatum || null,
        kommentar: raw.kommentar || null,
        projectId: raw.projectId || null,
        zahlungsartId: raw.zahlungsartId || null,
        erstattetAm: raw.erstattetAm || null,
      });
      if (!parsed.success) {
        return fail(422, {
          error: "Ungültige Eingabe",
          issues: parsed.error.issues,
        });
      }

      // Festschreibung gate
      const detail = await getTransactionDetail(params.id, "expense");
      if (!detail) return fail(404, { error: "Nicht gefunden" });
      if (detail.festgeschriebenAt) {
        return fail(409, { error: `Jahr ist festgeschrieben` });
      }
      const gateResult = await checkFestschreibungGate(
        detail.yearOfBuchung ?? new Date().getFullYear(),
      );
      if (!gateResult.ok)
        return fail(gateResult.status, { error: gateResult.error });

      const db = getDb();
      await db
        .update(expenses)
        .set({
          bezeichnung: parsed.data.bezeichnung,
          betragCents: BigInt(parsed.data.betragCents),
          rechnungsdatum: parsed.data.rechnungsdatum ?? null,
          kommentar: parsed.data.kommentar ?? null,
          kategorieNameSnapshot:
            parsed.data.kategorieNameSnapshot ?? detail.kategorieNameSnapshot,
          sphereSnapshot:
            parsed.data.sphereSnapshot ??
            (detail.sphereSnapshot as
              | "ideeller"
              | "vermoegen"
              | "zweckbetrieb"
              | "wirtschaftlich"),
          projectId: parsed.data.projectId ?? null,
          zahlungsartId: parsed.data.zahlungsartId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, params.id));

      await bus.emit("expense.updated", {
        id: params.id,
        actorUserId: user.id,
        payload: {
          bezeichnung: parsed.data.bezeichnung,
          betragCents: parsed.data.betragCents,
        },
      });

      return { ok: true, saved: true };
    }

    if (kind === "income") {
      const bezeichnung = String(raw.bezeichnung ?? "").trim();
      if (!bezeichnung) return fail(422, { error: "Bezeichnung fehlt" });

      const detail = await getTransactionDetail(params.id, "income");
      if (!detail) return fail(404, { error: "Nicht gefunden" });
      if (detail.festgeschriebenAt) {
        return fail(409, { error: "Jahr ist festgeschrieben" });
      }

      const db = getDb();
      await db
        .update(income)
        .set({
          bezeichnung,
          kommentar: String(raw.kommentar ?? "").trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(income.id, params.id));

      await bus.emit("income.updated", {
        id: params.id,
        actorUserId: user.id,
        payload: { bezeichnung },
      });

      return { ok: true, saved: true };
    }

    return { ok: true, saved: true };
  },

  "save-and-notify": async ({ request, params, url, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const kind = (url.searchParams.get("kind") ?? "expense") as TransactionKind;
    if (kind !== "expense") {
      return fail(400, { error: "Nur Ausgaben können benachrichtigt werden" });
    }

    const data = await request.formData();
    const raw = Object.fromEntries(data);

    const parsed = saveExpenseSchema.safeParse({
      ...raw,
      rechnungsdatum: raw.rechnungsdatum || null,
      kommentar: raw.kommentar || null,
      projectId: raw.projectId || null,
      zahlungsartId: raw.zahlungsartId || null,
      erstattetAm: raw.erstattetAm || null,
    });
    if (!parsed.success) {
      return fail(422, { error: "Ungültige Eingabe" });
    }

    const chosenDate = parsed.data.erstattetAm;
    const zahlungsartId = parsed.data.zahlungsartId;

    if (!chosenDate || !zahlungsartId) {
      return fail(422, {
        error:
          "Erstattungsdatum und Zahlungsart sind pflicht für Benachrichtigung",
      });
    }

    const detail = await getTransactionDetail(params.id, "expense");
    if (!detail) return fail(404, { error: "Nicht gefunden" });
    if (detail.festgeschriebenAt) {
      return fail(409, { error: "Jahr ist festgeschrieben" });
    }

    // First save the expense fields
    const db = getDb();
    await db
      .update(expenses)
      .set({
        bezeichnung: parsed.data.bezeichnung,
        betragCents: BigInt(parsed.data.betragCents),
        rechnungsdatum: parsed.data.rechnungsdatum ?? null,
        kommentar: parsed.data.kommentar ?? null,
        kategorieNameSnapshot:
          parsed.data.kategorieNameSnapshot ?? detail.kategorieNameSnapshot,
        sphereSnapshot:
          parsed.data.sphereSnapshot ??
          (detail.sphereSnapshot as
            | "ideeller"
            | "vermoegen"
            | "zweckbetrieb"
            | "wirtschaftlich"),
        projectId: parsed.data.projectId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, params.id));

    await bus.emit("expense.updated", {
      id: params.id,
      actorUserId: user.id,
      payload: {
        bezeichnung: parsed.data.bezeichnung,
        betragCents: parsed.data.betragCents,
        kind: "save_and_notify",
      },
    });

    // Then mark as erstattet (fires ErstattungsMail via bus handler)
    const result = await markExpenseErstattet({
      expenseId: params.id,
      chosenDate,
      zahlungsartId,
      actorUserId: user.id,
    });

    if (!result.ok) {
      return fail((result as { status: number }).status, {
        error: (result as { error: string }).error,
      });
    }

    return {
      ok: true,
      saved: true,
      notified: true,
      alreadyErstattet: result.alreadyErstattet,
    };
  },
} satisfies Actions;
