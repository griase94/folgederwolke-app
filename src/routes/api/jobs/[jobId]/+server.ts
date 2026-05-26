/**
 * GET /api/jobs/[jobId] — poll a queued background job.
 *
 * Used by the rechnungen detail page to poll for PDF-generation completion
 * after submission. Returns the invoice_jobs row state and (when finished)
 * the resulting invoice's pdf status so the client can flip into the
 * 'PDF herunterladen' UI without an extra round trip.
 */

import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { invoices } from "$lib/server/db/schema/invoices.js";

export const GET: RequestHandler = async ({ params, locals }) => {
  // Authenticated only — hooks.server.ts redirects unauthenticated requests
  // to /sign-in, but defensive 401 here belt-and-braces.
  if (!locals.session) {
    throw error(401, "Nicht authentifiziert");
  }

  const db = getDb();
  const [job] = await db
    .select()
    .from(invoiceJobs)
    .where(eq(invoiceJobs.id, params.jobId))
    .limit(1);
  if (!job) {
    throw error(404, "Job nicht gefunden");
  }

  const [inv] = await db
    .select({
      id: invoices.id,
      pdfStatus: invoices.pdfStatus,
      pdfFileId: invoices.pdfFileId,
      businessId: invoices.businessId,
    })
    .from(invoices)
    .where(eq(invoices.id, job.invoiceId))
    .limit(1);

  return new Response(
    JSON.stringify({
      jobId: job.id,
      invoiceId: job.invoiceId,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError ?? null,
      enqueuedAt: job.enqueuedAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      invoice: inv
        ? {
            id: inv.id,
            businessId: inv.businessId,
            pdfStatus: inv.pdfStatus,
            pdfFileId: inv.pdfFileId,
          }
        : null,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
};
