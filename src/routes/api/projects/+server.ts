/**
 * GET /api/projects?q=...&limit=20
 *
 * Autocomplete / search endpoint for project picker components
 * (AuslagenForm dropdown, expense forms). Returns up to `limit`
 * active (non-archived) projects whose name or businessId matches
 * the query string (case-insensitive contains).
 *
 * Authentication: requires a valid session.
 * Responds with JSON: { results: [{ id, name, businessId, sphereDefault }] }
 */

import { json, error } from "@sveltejs/kit";
import { ilike, isNull, or, and } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.session) {
    throw error(401, "Nicht angemeldet");
  }

  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);

  const db = getDb();

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      businessId: projects.businessId,
      sphereDefault: projects.sphereDefault,
    })
    .from(projects)
    .where(
      and(
        isNull(projects.deletedAt),
        q.length > 0
          ? or(
              ilike(projects.name, `%${q}%`),
              ilike(projects.businessId, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(projects.name)
    .limit(limit);

  return json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      businessId: r.businessId,
      sphereDefault: r.sphereDefault,
    })),
  });
};
