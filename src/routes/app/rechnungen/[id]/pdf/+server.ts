/**
 * GET /app/rechnungen/[id]/pdf — stream the stored PDF bytes back.
 *
 * Drive-failure resilience: serving from `invoices.pdf_bytes` works even
 * when Drive upload failed. If the Drive copy exists, downloads still go
 * through this endpoint so admins get a consistent UX (and we don't have
 * to expose Drive's anonymous-link gymnastics).
 */

import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";

export const GET: RequestHandler = async ({ params }) => {
  const db = getDb();
  const [row] = await db
    .select({
      pdfBytes: invoices.pdfBytes,
      businessId: invoices.businessId,
    })
    .from(invoices)
    .where(eq(invoices.id, params.id))
    .limit(1);
  if (!row) {
    throw error(404, "Rechnung nicht gefunden");
  }
  if (!row.pdfBytes) {
    throw error(409, "PDF wurde noch nicht generiert");
  }
  const bytes = row.pdfBytes as unknown as Buffer;
  const u8 = new Uint8Array(bytes);
  return new Response(u8, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="Rechnung_${row.businessId}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
};
