/**
 * /app/einstellungen/verein — Vereins-Stammdaten form.
 *
 * Phase 9, Task 10 — extends the existing `settings` key-value table with
 * `verein.*` rows. Reads fall back to VEREIN_* env vars when no row exists
 * (UI marks the field as "currently from env, will be persisted on save").
 *
 * Admin-only — the route is gated by /app/+layout.server.ts redirecting
 * unauthenticated requests to /sign-in; only admin-role sessions can reach
 * /app routes per the ADMIN_EMAILS gate in hooks.server.ts.
 */

import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  readStammdaten,
  writeStammdaten,
} from "$lib/server/domain/settings-stammdaten.js";

export const load: PageServerLoad = async () => {
  const stammdaten = await readStammdaten();
  const members = (await getDb().execute<{
    id: string;
    name: string;
    role: string;
  }>(sql`
    SELECT id::text AS id,
           (vorname || ' ' || nachname) AS name,
           role::text AS role
      FROM members
     WHERE role IN ('vorstand','kassenwart','schriftfuehrer')
     ORDER BY nachname, vorname
  `)) as { id: string; name: string; role: string }[];
  return { stammdaten, members };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? "";
    const data = await request.formData();
    const patch = {
      name: String(data.get("name") ?? ""),
      adresse: String(data.get("adresse") ?? ""),
      iban: String(data.get("iban") ?? "")
        .toUpperCase()
        .replace(/\s+/g, ""),
      bic: String(data.get("bic") ?? "").toUpperCase(),
      steuernummer: String(data.get("steuernummer") ?? ""),
      vr: String(data.get("vr") ?? ""),
      vorstandIds: data.getAll("vorstandIds").map((v) => String(v)),
    };
    const r = await writeStammdaten(patch, userId);
    if (!r.ok) return fail(400, { error: r.error, values: patch });
    return { ok: true };
  },
};
