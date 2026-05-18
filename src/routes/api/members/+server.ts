/**
 * GET /api/members?q=...&limit=20
 *
 * Autocomplete / search endpoint for member picker components (AuslagenForm,
 * admin search). Returns up to `limit` members whose name or email matches
 * the query string (case-insensitive prefix/contains search).
 *
 * Authentication: requires a valid session (same cookie-based auth as /app/*).
 * Responds with JSON: { results: [{ id, display_name, email, role }] }
 */

import { json, error } from "@sveltejs/kit";
import { ilike, or, and, isNull, sql } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";

export const GET: RequestHandler = async ({ url, locals }) => {
  // Require authentication
  if (!locals.session) {
    throw error(401, "Nicht angemeldet");
  }

  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);

  const db = getDb();

  const rows = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
      email: members.email,
      role: members.role,
    })
    .from(members)
    .where(
      and(
        // Exclude soft-deleted (ausgetreten) members from search results
        isNull(members.austrittsDatum),
        q.length > 0
          ? or(
              ilike(members.vorname, `%${q}%`),
              ilike(members.nachname, `%${q}%`),
              ilike(members.email, `%${q}%`),
              ilike(
                sql<string>`(${members.vorname} || ' ' || ${members.nachname})`,
                `%${q}%`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(members.nachname, members.vorname)
    .limit(limit);

  const results = rows.map((r) => ({
    id: r.id,
    display_name: `${r.vorname} ${r.nachname}`,
    email: r.email,
    role: r.role,
  }));

  return json({ results });
};
