/**
 * /app/einstellungen — Einstellungen page server load + actions.
 *
 * Exposes read-only VEREIN_* org constants (from env) and the current user.
 * Phase 10 adds an editable Kassenwärt:in name (persisted in settings
 * under key 'verein.kassenwaert_name'); admins can update it without a
 * redeploy because it rotates between people.
 */

import { fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { env } from "$lib/server/env.js";
import { addressLines } from "$lib/server/domain/address.js";

const KASSEN_KEY = "verein.kassenwaert_name";

function unquote(s: string): string {
  return s.replace(/^"|"$/g, "");
}

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = ${KASSEN_KEY}`,
  );
  const raw = (rows as { value: unknown }[])[0]?.value;
  const kassenwaertName =
    typeof raw === "string"
      ? unquote(raw)
      : raw !== null && raw !== undefined
        ? String(raw)
        : "Julia Schwarz";

  return {
    user: locals.session!.user,
    verein: {
      name: env.VEREIN_NAME,
      steuernummer: env.VEREIN_STEUERNUMMER,
      vr: env.VEREIN_VR,
      adresse: addressLines(env.VEREIN_ADRESSE).join("\n"),
      iban: env.VEREIN_IBAN,
      bic: env.VEREIN_BIC,
      bank: env.VEREIN_BANK,
    },
    kassenwaertName,
    mailFrom: env.MAIL_FROM,
  };
};

export const actions: Actions = {
  // Update the Kassenwärt:in name (persists to settings table).
  saveKassenwaertName: async ({ request }) => {
    const formData = await request.formData();
    const name = String(formData.get("kassenwaertName") ?? "").trim();
    if (name.length === 0) {
      return fail(422, {
        action: "saveKassenwaertName",
        error: "Name darf nicht leer sein",
      });
    }
    if (name.length > 200) {
      return fail(422, {
        action: "saveKassenwaertName",
        error: "Name zu lang (max. 200 Zeichen)",
      });
    }

    const db = getDb();
    // Store as JSONB string. Use a parameterised INSERT/UPDATE with explicit
    // jsonb cast via sql tag.
    await db.execute(
      sql`INSERT INTO settings (key, value)
          VALUES (${KASSEN_KEY}, ${JSON.stringify(name)}::jsonb)
          ON CONFLICT (key) DO UPDATE
            SET value = ${JSON.stringify(name)}::jsonb,
                updated_at = now()`,
    );

    return { action: "saveKassenwaertName", success: true };
  },
};
