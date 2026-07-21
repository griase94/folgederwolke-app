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
import { sentMails } from "$lib/server/db/schema/mails.js";
import { users } from "$lib/server/db/schema/users.js";
import {
  markInvoiceAsPaid,
  retryInvoicePdf,
  sendInvoiceMail,
  supersedeInvoice,
  undoPayment,
} from "$lib/server/domain/invoices.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { addressLines } from "$lib/server/domain/address.js";
import { env } from "$lib/server/env.js";
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
      customerEmail: customers.email,
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
      actorEmail: users.email,
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
    // Fall back to the user's e-mail when the display name is unset, so a real
    // actor never renders as "System" (which is reserved for system actions).
    actorEmail: r.actorEmail ?? null,
    payload: (r.payload as Record<string, unknown> | null) ?? {},
  }));

  // Versand (G3): latest invoice_versendet sent_mails row → the detail's
  // "Versendet am … an {email}" fact + the failed/retry state + whether the
  // send action relabels to "Erneut senden".
  const [versandRow] = await db
    .select({
      sendAttempt: sentMails.sendAttempt,
      to: sentMails.toDisplay,
      status: sentMails.status,
      sentAt: sentMails.sentAt,
      queuedAt: sentMails.queuedAt,
    })
    .from(sentMails)
    .where(
      and(
        eq(sentMails.template, "invoice_versendet"),
        eq(sentMails.entityKind, "invoice"),
        eq(sentMails.entityId, id),
      ),
    )
    .orderBy(desc(sentMails.sendAttempt))
    .limit(1);

  const versand = versandRow
    ? {
        to: versandRow.to,
        status: versandRow.status,
        sendAttempt: versandRow.sendAttempt,
        // 'sent' rows carry sent_at; a failed attempt only has queued_at.
        at: (versandRow.sentAt ?? versandRow.queuedAt).toISOString(),
      }
    : null;

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

  // Aussteller block on the doc-sheet (board finding): name + postal address
  // + contact e-mail, sourced the same way the real canonical PDF does
  // (readStammdaten() for name/address, MAIL_FROM for the footer contact
  // e-mail — see loadRenderInput in $lib/server/domain/invoices.ts).
  const sd = await readStammdaten();
  const verein = {
    name: sd.name,
    adresseLines: addressLines(sd.adresse),
    email: env.MAIL_FROM || "",
  };

  return {
    invoice,
    predecessor,
    successor,
    auditEntries,
    versand,
    customerEmail: row.customerEmail ?? null,
    today,
    verein,
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

  // Send the invoice to the customer by email (E-PR3). Guards + send_attempt
  // + the actual dispatch live in sendInvoiceMail → the invoice.versendet bus
  // handler. `resend=1` marks a deliberate re-send of an already-sent invoice.
  "send-mail": async ({ params, request, locals }) => {
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
    const actorUserId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const resend = formData.get("resend")?.toString() === "1";

    const result = await sendInvoiceMail(params.id, { resend }, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "send-mail", error: result.error });
    }
    throw redirect(
      303,
      `/app/rechnungen/${params.id}?sent=${resend ? "resend" : "1"}`,
    );
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
