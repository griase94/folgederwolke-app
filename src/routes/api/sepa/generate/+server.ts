/**
 * POST /api/sepa/generate — generate SEPA pain.001.001.03 XML for approved expenses.
 *
 * Body: { expenseIds: string[] }
 * Returns: { xml: string, txCount: number, totalCents: number, msgId: string }
 *
 * Admin-only endpoint (session guard via hooks.server.ts for /app/* routes;
 * this /api route also checks session explicitly).
 */

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { listApprovedPendingErstattet } from "$lib/server/domain/transactions.js";
import {
  buildSepaInputs,
  generateSepaXmlFromSettings,
} from "$lib/server/sepa/xml.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.session?.user) {
    error(401, "Nicht angemeldet");
  }
  // Defense-in-depth: SEPA pain.001 export is admin-only. Sign-in is gated by
  // ADMIN_EMAILS today so all sessions are admin, but the role enum also
  // allows `steuerberater` and `member_self_service` for future flows — only
  // admin should be able to mint a SEPA file against the Vereinskonto.
  if (locals.session.user.role !== "admin") {
    error(403, "Nicht berechtigt");
  }

  let body: { expenseIds?: unknown };
  try {
    body = await request.json();
  } catch {
    error(400, "Ungültiger Request-Body");
  }

  const ids = body.expenseIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    error(400, "expenseIds fehlt oder leer");
  }

  const idSet = new Set(ids as string[]);

  // Load approved-pending rows (server is source of truth for IBAN data)
  const allApproved = await listApprovedPendingErstattet();
  const selected = allApproved.filter((e) => idSet.has(e.id));

  if (selected.length === 0) {
    error(404, "Keine genehmigten Auslagen gefunden");
  }

  const inputs = buildSepaInputs(selected);

  if (inputs.length === 0) {
    error(422, "Keine Auslagen mit bekannter IBAN — bitte IBAN hinterlegen");
  }

  const result = await generateSepaXmlFromSettings(inputs);

  return json(result);
};
