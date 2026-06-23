/**
 * GET /app/rechnungen/[id]/pdf — redirect to the blob-backed PDF.
 *
 * Phase 11: PDFs live on Vercel Blob via the `files` table. We resolve the
 * invoice's `pdf_file_id`, then 302 to /api/files/<fileId>/blob which handles
 * session-gated access via authorizeFileAccess + streams from FileStorage.
 *
 * Status mapping:
 *   - invoice not found             → 404
 *   - pdf_status !== 'generated'    → 409 ("noch nicht generiert" — admins
 *                                          should wait for the poll to settle;
 *                                          an edit (Phase 12) re-queues the
 *                                          render with a fresh job)
 *   - pdf_file_id IS NULL           → 409 (defence-in-depth: with the new
 *                                          state machine this should never
 *                                          happen if pdf_status==='generated')
 */

import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { assertUuidOr404 } from "$lib/domain/uuid.js";

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.session) {
    throw error(401, "Nicht authentifiziert");
  }

  // F14: validate the uuid param first → clean 404 instead of a 22P02 500.
  const id = assertUuidOr404(params.id, "Rechnung nicht gefunden");

  const db = getDb();
  const [row] = await db
    .select({
      pdfStatus: invoices.pdfStatus,
      pdfFileId: invoices.pdfFileId,
    })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!row) {
    throw error(404, "Rechnung nicht gefunden");
  }
  if (row.pdfStatus !== "generated" || !row.pdfFileId) {
    throw error(409, "PDF wurde noch nicht generiert");
  }

  // 302 to the generic files endpoint — single source of truth for blob auth
  // + streaming. `inline` disposition + filename are honoured downstream by
  // /api/files/[id]/blob which reads `originalFilename` from the row.
  throw redirect(302, `/api/files/${row.pdfFileId}/blob`);
};
