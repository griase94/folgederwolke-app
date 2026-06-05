/**
 * /app/transactions — LEGACY merged list route.
 *
 * Phase 3 (Task 10) replaced the merged list with three flat list routes
 * (`/app/{ausgaben,einnahmen,spenden}`). The `load` now permanently redirects
 * this path to `/app/ausgaben` (308 — preserves the request method and the
 * query string, so a bookmarked `?year=`/filter survives the move).
 *
 * The nested routes under this path (`[id]`, `[id]/zuwendungsbestaetigung`)
 * still resolve — the 308 is on the LIST page's `load` only (review B2). The
 * Bescheinigung route moves to `/app/spenden/[id]/…` in Phase 6 (C3).
 *
 * actions: kept reachable for the bulk/SEPA/quick-action POSTs still wired to
 * this endpoint. Their per-tab homes land in Phase 4+; until then the
 * `redirect` only supersedes the list-page GET, not the action POSTs.
 *   ?/bulk-mark-erstattet  — bulk markExpenseErstattet via existing helper
 *   ?/sepa-mark-erstattet  — post-SEPA modal: mark N as erstattet + notify
 *   ?/markAsPaid           — quick "Bezahlt markieren" from the row kebab
 *   ?/unmark-erstattet     — 5-second undo window reversal (best-effort)
 */

import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import { markExpenseAsPaid } from "$lib/server/domain/transactions.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { eq, isNull, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// load — 308 redirect to the new flat Ausgaben list (Phase 3, Task 10)
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url }) => {
  // Preserve any query (e.g. ?year=2024, ?kind=…, filters) onto the new path so
  // bookmarks + dashboard deep-links keep working. 308 (vs 301/302) keeps the
  // method + is the correct "permanently moved, don't re-issue as GET" code.
  const target = url.search ? `/app/ausgaben${url.search}` : "/app/ausgaben";
  redirect(308, target);
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
