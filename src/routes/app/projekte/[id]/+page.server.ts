/**
 * /app/projekte/[id] — Project detail page.
 *
 * load()   → fetch project by id (404 if not found)
 * actions:
 *   ?/edit   — edit master data
 *   ?/delete — soft-delete (sets deleted_at = now())
 */

import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  editProject,
  softDeleteProject,
} from "$lib/server/domain/projects-actions.js";

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const db = getDb();

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    error(404, "Projekt nicht gefunden");
  }

  const p = rows[0];

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
  };
};

export const actions: Actions = {
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    if (!raw.id && params.id) raw.id = params.id;

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
