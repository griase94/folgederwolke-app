/**
 * GET /app/transactions/[id]/zuwendungsbestaetigung/pdf
 *
 * Streams the rendered Zuwendungsbestaetigung PDF for the given Spende.
 * Refuses if no bescheinigung_nr has been allocated yet (use the parent
 * page's ?/generate action first) or if Bescheinigung-feature is disabled
 * in env.
 */

import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import {
  extractBmfPflichtfelder,
  isBescheinigungEnabled,
} from "$lib/server/domain/spenden.js";
import { pdfLibBescheinigungRenderer } from "$lib/server/pdf/bescheinigung.js";

export const GET: RequestHandler = async ({ params }) => {
  if (!isBescheinigungEnabled()) {
    throw error(
      412,
      "Bescheinigung kann nicht generiert werden - Freistellungsbescheid fehlt in den Einstellungen",
    );
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(donations)
    .where(eq(donations.id, params.id))
    .limit(1);
  const sp = rows[0];
  if (!sp) throw error(404, "Spende nicht gefunden");
  if (!sp.bescheinigungNr) {
    throw error(409, "Bescheinigung wurde noch nicht ausgestellt");
  }

  const pflichtfelder = extractBmfPflichtfelder(sp);
  const out = await pdfLibBescheinigungRenderer.render(pflichtfelder);

  return new Response(out.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": out.mimeType,
      "Content-Length": String(out.bytes.byteLength),
      "Content-Disposition": `inline; filename="${out.suggestedFilename}"`,
      "Cache-Control": "private, no-store",
    },
  });
};
