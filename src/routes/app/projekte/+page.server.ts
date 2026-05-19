/**
 * /app/projekte — Projekte list page.
 *
 * load()    → fetches all non-archived projects ordered by name
 * actions:
 *   default (?/add)  → add a new project
 *   ?/edit           → edit an existing project
 *   ?/delete         → soft-delete (sets deleted_at = now())
 */

import { fail } from "@sveltejs/kit";
import { isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  addProject,
  editProject,
  softDeleteProject,
} from "$lib/server/domain/projects-actions.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  const rows = await db
    .select()
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(projects.name);

  return {
    projects: rows.map((p) => ({
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      sphereDefault: p.sphereDefault,
      startDate: p.startDate,
      endDate: p.endDate,
      notes: p.notes,
      isFixture: p.isFixture,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
  };
};

export const actions: Actions = {
  // ── Add project ────────────────────────────────────────────────────────────
  default: async ({ request, locals }) => {
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
};
