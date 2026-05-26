/**
 * /app/transactions — merged Ausgaben + Einnahmen + Spenden list.
 *
 * load(): returns paginated transaction rows, zahlungsarten for dropdowns,
 *         and approved-pending-erstattet expenses for the SEPA action.
 *
 * actions:
 *   ?/bulk-mark-erstattet  — bulk markExpenseErstattet via existing helper
 *   ?/sepa-mark-erstattet  — post-SEPA modal: mark N as erstattet + notify
 *   ?/unmark-erstattet     — 5-second undo window reversal (best-effort)
 */

import { fail } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  listTransactions,
  listZahlungsarten,
  listApprovedPendingErstattet,
  markExpenseAsPaid,
} from "$lib/server/domain/transactions.js";
import { parseKindFromUrl } from "$lib/domain/transaction-kind-url.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { eq, isNull, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url }) => {
  // C3-2: accept DE aliases (einnahme/ausgabe/spende, with plurals) in
  // addition to the canonical EN kinds. Dashboard cards link with German
  // names because that reads naturally to the treasurer.
  const kind = parseKindFromUrl(url.searchParams.get("kind")) ?? undefined;
  const search = url.searchParams.get("q") ?? undefined;
  const yearParam = url.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;
  const monthParam = url.searchParams.get("month");
  const month = monthParam ? parseInt(monthParam, 10) : undefined;

  const [{ rows, total }, zahlungsarten, approvedPending] = await Promise.all([
    listTransactions({ kind, search, year, month, limit: 100 }),
    listZahlungsarten(),
    listApprovedPendingErstattet(),
  ]);

  return {
    rows,
    total,
    zahlungsarten,
    approvedPending,
    filters: { kind, search, year, month },
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

const bulkMarkErstattetSchema = z.object({
  expenseIds: z.string().transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  chosenDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  zahlungsartId: z.string().uuid(),
  notify: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export const actions = {
  "bulk-mark-erstattet": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const parsed = bulkMarkErstattetSchema.safeParse({
      expenseIds: data.get("expenseIds"),
      chosenDate: data.get("chosenDate"),
      zahlungsartId: data.get("zahlungsartId"),
      notify: data.get("notify"),
    });
    if (!parsed.success) {
      return fail(422, { error: "Ungültige Eingabe" });
    }

    const { expenseIds, chosenDate, zahlungsartId } = parsed.data;
    const errors: string[] = [];

    for (const expenseId of expenseIds) {
      const result = await markExpenseErstattet({
        expenseId,
        chosenDate,
        zahlungsartId,
        actorUserId: user.id,
      });
      if (!result.ok) {
        errors.push(`${expenseId}: ${result.error}`);
      }
    }

    if (errors.length > 0) {
      return fail(409, { error: errors.join("; ") });
    }

    return { ok: true, count: expenseIds.length };
  },

  "sepa-mark-erstattet": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const parsed = bulkMarkErstattetSchema.safeParse({
      expenseIds: data.get("expenseIds"),
      chosenDate: data.get("chosenDate"),
      zahlungsartId: data.get("zahlungsartId"),
      notify: data.get("notify") ?? "true",
    });
    if (!parsed.success) {
      return fail(422, { error: "Ungültige Eingabe" });
    }

    const { expenseIds, chosenDate, zahlungsartId } = parsed.data;
    const errors: string[] = [];

    for (const expenseId of expenseIds) {
      const result = await markExpenseErstattet({
        expenseId,
        chosenDate,
        zahlungsartId,
        actorUserId: user.id,
      });
      if (!result.ok) {
        errors.push(`${expenseId}: ${result.error}`);
      }
    }

    if (errors.length > 0) {
      return fail(409, { error: errors.join("; ") });
    }

    return { ok: true, count: expenseIds.length };
  },

  // C3-DISC: quick "Bezahlt markieren" from the TransactionRow kebab.
  // No mail dispatch — that path stays on `?/save-and-notify` on the detail page.
  markAsPaid: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const id = String(data.get("id") ?? "");
    const datum = String(data.get("datum") ?? "");
    const zahlartRaw = data.get("zahlart");
    const zahlartId =
      typeof zahlartRaw === "string" && zahlartRaw.length > 0
        ? zahlartRaw
        : null;

    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return fail(400, { error: "Ungültige Expense-ID" });
    }

    const result = await markExpenseAsPaid(id, {
      datum,
      zahlartId,
      actorUserId: user.id,
    });
    if (!result.ok) return fail(400, { error: result.error });
    return { ok: true };
  },

  "unmark-erstattet": async ({ request, locals }) => {
    // Best-effort 5-second undo — reverses erstattet_am only if called within
    // the undo window (client enforces the window; server accepts all requests
    // but does nothing if already festgeschrieben).
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const expenseId = data.get("expenseId");
    if (typeof expenseId !== "string" || !expenseId) {
      return fail(400, { error: "Fehlende expense-ID" });
    }

    const db = getDb();

    // Only reverse if not festgeschrieben
    const rows = await db
      .select({
        festgeschriebenAt: expenses.festgeschriebenAt,
        yearOfBuchung: expenses.yearOfBuchung,
      })
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);

    const expense = rows[0];
    if (!expense) return fail(404, { error: "Buchung nicht gefunden" });
    if (expense.festgeschriebenAt) {
      return fail(409, {
        error: "Buchung ist festgeschrieben — Undo nicht möglich",
      });
    }

    await db
      .update(expenses)
      .set({
        erstattetAm: null,
        zahlungsartId: null,
        status: "geprueft",
        abflussDatum: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(expenses.id, expenseId), isNull(expenses.festgeschriebenAt)),
      );

    return { ok: true };
  },
} satisfies Actions;
