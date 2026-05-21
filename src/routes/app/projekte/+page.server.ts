/**
 * /app/projekte — Projekte list page.
 *
 * load()    → fetches all non-archived projects ordered by name
 * actions:
 *   default (?/add)  → add a new project
 *   ?/edit           → edit an existing project
 *   ?/delete         → soft-delete (sets deleted_at = now())
 *   ?/restore        → undo the soft-delete (clears deleted_at)
 */

import { fail } from "@sveltejs/kit";
import { isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { customers } from "$lib/server/db/schema/customers.js";
import {
  addProject,
  editProject,
  softDeleteProject,
  restoreProject,
} from "$lib/server/domain/projects-actions.js";
import { batchProjectFinancials } from "$lib/server/domain/projects.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  const [rows, customerRows] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.name),
    // Used by AddProjectDialog + EditProjectDialog (Default-Kunde combobox).
    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(customers.name),
  ]);

  // Batched financials so each row can render a saldo pill without
  // per-row round-trips (N+1-safe — exactly two SQL execs total).
  const ids = rows.map((p) => p.id);
  const financialsMap = await batchProjectFinancials(ids);

  return {
    projects: rows.map((p) => ({
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
    })),
    customers: customerRows,
    financialsMap,
  };
};

export const actions: Actions = {
  // ── Add project ────────────────────────────────────────────────────────────
  // Named `add` — SvelteKit forbids mixing default with named actions.
  // AddProjectDialog posts to `?/add`.
  add: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await addProject(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "add",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "add", success: true, projectId: result.projectId };
  },

  // ── Edit project ───────────────────────────────────────────────────────────
  edit: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

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

  // ── Soft-delete project ────────────────────────────────────────────────────
  delete: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await softDeleteProject(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Restore soft-deleted project (undo) ────────────────────────────────────
  restore: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await restoreProject(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "restore", error: result.error });
    }

    return { action: "restore", success: true };
  },
};
