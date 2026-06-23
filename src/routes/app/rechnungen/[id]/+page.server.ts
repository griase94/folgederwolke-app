/**
 * /app/rechnungen/[id] — invoice detail page.
 *
 * load()  → invoice + linked customer/project/kategorie + latest job state
 *           + audit_log timeline for the Verlauf section (joined with users
 *           for the actor display name).
 *
 * actions:
 *   supersede     → create a new invoice that replaces this one (kept in
 *                   code for now even though the UI no longer surfaces it;
 *                   Phase 13 will replace it with a Storno + correction flow).
 *   mark-paid     → mark unpaid invoice as paid + auto-create matching
 *                   income row (Phase 12-A domain layer).
 *   undo-payment  → same-day-only fat-finger recovery; deletes the income
 *                   row + clears bezahlt_am.
 *
 * The legacy `?/regenerate` action was removed in Phase 12-A — sha-dedup
 * made it a near-no-op and "Bearbeiten" replaces it as the primary edit
 * pathway.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { income } from "$lib/server/db/schema/income.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { users } from "$lib/server/db/schema/users.js";
import {
  markInvoiceAsPaid,
  retryInvoicePdf,
  supersedeInvoice,
  undoPayment,
} from "$lib/server/domain/invoices.js";
import type {
  InvoiceDetail,
  InvoiceHistoryEntry,
  InvoicePdfStatus,
} from "$lib/domain/invoices.js";
import { assertUuidOr404 } from "$lib/domain/uuid.js";

export const load: PageServerLoad = async ({ params, url }) => {
  const db = getDb();
  // F14: a non-UUID param (bad bookmark, typo, stale link) would hit the uuid
  // column as 22P02 → 500. Validate first → clean 404.
  const id = assertUuidOr404(params.id, "Rechnung nicht gefunden");

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

  // Linked income row business_id (populated when invoice is paid). Used by
  // the paid-banner on the detail page.
  let paidByIncomeBusinessId: string | null = null;
  if (inv.paidByIncomeId) {
    const [incomeRow] = await db
      .select({ businessId: income.businessId })
      .from(income)
      .where(eq(income.id, inv.paidByIncomeId))
      .limit(1);
    if (incomeRow) paidByIncomeBusinessId = incomeRow.businessId;
  }

  // Verlauf: audit_log rows for this invoice, newest first, joined to users
  // so the timeline can render the actor's display name. Pattern from
  // src/routes/app/mitglieder/[id]/+page.server.ts:60-65.
  const auditRows = await db
    .select({
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      payload: auditLog.payload,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.entityKind, "invoice"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.occurredAt))
    .limit(50);

  const auditEntries: InvoiceHistoryEntry[] = auditRows.map((r) => ({
    occurredAt: r.occurredAt.toISOString(),
    action: r.action as "create" | "update" | "delete",
    actorName: r.actorName ?? null,
    payload: (r.payload as Record<string, unknown> | null) ?? {},
  }));

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
    leistungszeitraum: inv.leistungszeitraum,
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
    bezahltAm: inv.bezahltAm ?? null,
    paidByIncomeId: inv.paidByIncomeId ?? null,
    paidByIncomeBusinessId,
    kategorieId: inv.kategorieId ?? null,
    kategorieNameSnapshot: inv.kategorieNameSnapshot,
    sphereSnapshot: inv.sphereSnapshot,
    projectId: inv.projectId ?? null,
    projectName: row.projectName ?? null,
    createdAt: inv.createdAt.toISOString(),
  };

  // Today (Berlin) as ISO YYYY-MM-DD — used as the default + max bound for
  // the mark-paid DateField. The detail page renders this client-side; the
  // domain re-checks the upper bound on submit.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return {
    invoice,
    predecessor,
    successor,
    auditEntries,
    today,
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
    paidFlash: url.searchParams.get("paid") === "1",
    undoneFlash: url.searchParams.get("undone") === "1",
  };
};

export const actions: Actions = {
  supersede: async ({ params, locals }) => {
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
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

  // Recover a missing/failed PDF — re-enqueue generation for THIS invoice.
  // Redirect with ?job=<id> so the page's existing poll machinery picks up
  // the new job and refreshes when it finishes.
  "retry-pdf": async ({ params, locals }) => {
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
    const actorUserId = locals.session?.user.id ?? null;
    const result = await retryInvoicePdf(params.id, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "retry-pdf", error: result.error });
    }
    throw redirect(303, `/app/rechnungen/${params.id}?job=${result.jobId}`);
  },

  // Mark unpaid → paid. Auto-creates the matching income row in one tx
  // (see markInvoiceAsPaid in src/lib/server/domain/invoices.ts).
  "mark-paid": async ({ params, request, locals }) => {
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
    const actorUserId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const bezahltAm = formData.get("bezahltAm")?.toString() ?? "";

    const result = await markInvoiceAsPaid(params.id, bezahltAm, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "mark-paid", error: result.error });
    }
    throw redirect(303, `/app/rechnungen/${params.id}?paid=1`);
  },

  // Same-day-only fat-finger recovery — deletes the linked income row and
  // clears bezahlt_am on the invoice. Guarded by the domain layer.
  "undo-payment": async ({ params, locals }) => {
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
    const actorUserId = locals.session?.user.id ?? null;
    const result = await undoPayment(params.id, actorUserId);
    if (!result.ok) {
      return fail(result.status, {
        action: "undo-payment",
        error: result.error,
      });
    }
    throw redirect(303, `/app/rechnungen/${params.id}?undone=1`);
  },
};
