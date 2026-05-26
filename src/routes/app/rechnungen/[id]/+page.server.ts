/**
 * /app/rechnungen/[id] — invoice detail page.
 *
 * load()  → invoice + linked customer/project/kategorie + latest job state
 *
 * actions:
 *   regenerate → re-run PDF generation in place (only when not festgeschrieben)
 *   supersede  → create a new invoice that replaces this one
 *   download   → streamed PDF bytes (works even if Drive upload failed)
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  regeneratePdf,
  supersedeInvoice,
} from "$lib/server/domain/invoices.js";
import type { InvoiceDetail, InvoicePdfStatus } from "$lib/domain/invoices.js";

export const load: PageServerLoad = async ({ params, url }) => {
  const db = getDb();
  const id = params.id;

  const [row] = await db
    .select({
      inv: invoices,
      customerName: customers.name,
      projectName: projects.name,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(projects, eq(projects.id, invoices.projectId))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!row) {
    throw error(404, "Rechnung nicht gefunden");
  }
  const inv = row.inv;

  const [latestJob] = await db
    .select()
    .from(invoiceJobs)
    .where(eq(invoiceJobs.invoiceId, id))
    .orderBy(desc(invoiceJobs.enqueuedAt))
    .limit(1);

  // If a supersedes_id is set, fetch the predecessor for the "ersetzt"
  // banner. If THIS invoice is the predecessor, find its successor.
  let predecessor: { id: string; businessId: string } | null = null;
  let successor: { id: string; businessId: string } | null = null;
  if (inv.supersedesId) {
    const [pred] = await db
      .select({ id: invoices.id, businessId: invoices.businessId })
      .from(invoices)
      .where(eq(invoices.id, inv.supersedesId))
      .limit(1);
    if (pred) predecessor = pred;
  }
  const [succ] = await db
    .select({ id: invoices.id, businessId: invoices.businessId })
    .from(invoices)
    .where(eq(invoices.supersedesId, id))
    .limit(1);
  if (succ) successor = succ;

  const invoice: InvoiceDetail = {
    id: inv.id,
    businessId: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    leistungsDatum: inv.leistungsDatum ?? null,
    faelligkeitsDatum: inv.faelligkeitsDatum ?? null,
    customerId: inv.customerId,
    customerName: row.customerName ?? inv.customerNameSnapshot,
    customerAddressSnapshot: inv.customerAddressSnapshot ?? null,
    bezeichnung: inv.bezeichnung,
    leistungsBeschreibung: inv.leistungsBeschreibung ?? null,
    nettoCents: Number(inv.nettoCents),
    bruttoCents: Number(inv.bruttoCents),
    currency: inv.currency,
    pdfStatus: inv.pdfStatus as InvoicePdfStatus,
    pdfFileId: inv.pdfFileId ?? null,
    pdfStatusError: inv.pdfStatusError ?? null,
    festgeschriebenAt: inv.festgeschriebenAt
      ? inv.festgeschriebenAt.toISOString()
      : null,
    supersedesId: inv.supersedesId ?? null,
    supersededByBusinessId: successor?.businessId ?? null,
    kategorieId: inv.kategorieId ?? null,
    kategorieNameSnapshot: inv.kategorieNameSnapshot,
    sphereSnapshot: inv.sphereSnapshot,
    projectId: inv.projectId ?? null,
    projectName: row.projectName ?? null,
    createdAt: inv.createdAt.toISOString(),
  };

  return {
    invoice,
    predecessor,
    successor,
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          attempts: latestJob.attempts,
          lastError: latestJob.lastError ?? null,
          enqueuedAt: latestJob.enqueuedAt.toISOString(),
          finishedAt: latestJob.finishedAt
            ? latestJob.finishedAt.toISOString()
            : null,
        }
      : null,
    pollJobId: url.searchParams.get("job"),
  };
};

export const actions: Actions = {
  regenerate: async ({ params, locals }) => {
    const actorUserId = locals.session?.user.id ?? null;
    const result = await regeneratePdf(params.id, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "regenerate", error: result.error });
    }
    throw redirect(303, `/app/rechnungen/${params.id}?job=${result.jobId}`);
  },

  supersede: async ({ params, locals }) => {
    const actorUserId = locals.session?.user.id ?? null;
    const result = await supersedeInvoice(params.id, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "supersede", error: result.error });
    }
    throw redirect(
      303,
      `/app/rechnungen/${result.newInvoiceId}?job=${result.jobId}`,
    );
  },
};
