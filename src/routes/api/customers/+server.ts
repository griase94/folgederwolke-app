/**
 * GET /api/customers?q=...&limit=20
 *
 * Autocomplete / search endpoint for customer picker components
 * (invoice creation flow). Returns up to `limit` active (non-archived)
 * customers whose name or email matches the query string
 * (case-insensitive contains).
 *
 * Authentication: requires a valid session.
 * Responds with JSON: { results: [{ id, name, email, anrede, addressBlock }] }
 */

import { json, error } from "@sveltejs/kit";
import { ilike, isNull, or, and } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";

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
      id: customers.id,
      name: customers.name,
      email: customers.email,
      anrede: customers.anrede,
      adresszusatz: customers.adresszusatz,
      strasse: customers.strasse,
      plz: customers.plz,
      ort: customers.ort,
      land: customers.land,
      addressBlock: customers.addressBlock,
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        q.length > 0
          ? or(
              ilike(customers.name, `%${q}%`),
              ilike(customers.email, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(customers.name)
    .limit(limit);

  return json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      anrede: r.anrede,
      adresszusatz: r.adresszusatz,
      strasse: r.strasse,
      plz: r.plz,
      ort: r.ort,
      land: r.land,
      addressBlock: r.addressBlock,
    })),
  });
};
