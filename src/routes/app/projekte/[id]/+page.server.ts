/**
 * /app/projekte/[id] — Project detail page (C1-PRJ-A Phase 1).
 *
 * load() — fetches the project (404 if not found), batched financials
 *          aggregates for the hero, and up to 50 most-recent transactions
 *          (income UNION expense) for the Transaktionen tab.
 *
 * actions:
 *   ?/edit   — edit master data (incl. default_customer_id)
 *   ?/delete — soft-delete (sets deleted_at = now())
 *
 * Scope-guard: only the Übersicht + Transaktionen tabs ship here. Other
 * tabs (Rechnungen / Auslagen / Belege / Verlauf) are Night-2 follow-ups.
 */

import { error, fail } from "@sveltejs/kit";
import { eq, isNull, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { customers } from "$lib/server/db/schema/customers.js";
import {
  editProject,
  softDeleteProject,
} from "$lib/server/domain/projects-actions.js";
import { projectFinancials } from "$lib/server/domain/projects.js";

export const load: PageServerLoad = async ({ params, url }) => {
  const { id } = params;
  const db = getDb();

  // C1-PRJ-A: forward `?toast=` payload (set by /rechnungen/new redirect
  // after `?from=projekt` save). JSON.parse + shape-validate so a malformed
  // token degrades silently instead of crashing the page.
  let toast: { message: string; kind: "success" | "info" | "error" } | null =
    null;
  const toastRaw = url.searchParams.get("toast");
  if (toastRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(toastRaw)) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { message?: unknown }).message === "string" &&
        ["success", "info", "error"].includes(
          String((parsed as { kind?: unknown }).kind ?? ""),
        )
      ) {
        toast = parsed as {
          message: string;
          kind: "success" | "info" | "error";
        };
      }
    } catch {
      toast = null;
    }
  }

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    error(404, "Projekt nicht gefunden");
  }

  const p = rows[0];

  // Financials aggregate (5 KPI tiles + saldo pill) + the customer list
  // for EditProjectDialog's Default-Kunde combobox.
  const [financials, customerRows] = await Promise.all([
    projectFinancials(p.id),
    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(customers.name),
  ]);

  // Up to 50 most-recent transactions linked to the project. Income
  // sorts on geld_eingang_datum, expenses on rechnungsdatum. NULL dates
  // sort last so they don't crowd out dated rows.
  const txnRows = (await db.execute<{
    id: string;
    kind: "income" | "expense";
    bezeichnung: string;
    betrag_cents: string;
    datum: string | null;
    status: string;
  }>(sql`
    SELECT id::text, 'expense'::text AS kind, bezeichnung,
           betrag_cents::text,
           rechnungsdatum::text AS datum,
           status::text
      FROM expenses
     WHERE project_id = ${p.id}::uuid
    UNION ALL
    SELECT id::text, 'income'::text, bezeichnung,
           betrag_cents::text,
           geld_eingang_datum::text,
           'gebucht'::text
      FROM income
     WHERE project_id = ${p.id}::uuid
    ORDER BY datum DESC NULLS LAST
    LIMIT 50
  `)) as Array<{
    id: string;
    kind: "income" | "expense";
    bezeichnung: string;
    betrag_cents: string;
    datum: string | null;
    status: string;
  }>;

  const transactions = txnRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    bezeichnung: r.bezeichnung,
    betragCents: Number(r.betrag_cents),
    datum: r.datum,
    status: r.status,
  }));

  return {
    project: {
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      sphereDefault: p.sphereDefault,
      startDate: p.startDate,
      endDate: p.endDate,
      notes: p.notes,
      defaultCustomerId: p.defaultCustomerId,
      isFixture: p.isFixture,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    },
    financials,
    transactions,
    customers: customerRows,
    toast,
  };
};

export const actions: Actions = {
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    if (!raw["id"] && params.id) raw["id"] = params.id;

    const result = await editProject(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "edit",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "edit", success: true };
  },

  delete: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() || params.id || "";

    const result = await softDeleteProject(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },
};
