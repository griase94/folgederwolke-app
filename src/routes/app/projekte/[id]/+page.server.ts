/**
 * /app/projekte/[id] — Project detail page (C1-PRJ-A Phase 1).
 *
 * load() — fetches the project (404 if not found), batched financials
 *          aggregates for the hero, and up to 50 most-recent transactions
 *          (income UNION expense) for the Transaktionen tab.
 *
 * actions:
 *   ?/edit   — edit master data (incl. default_customer_id)
 *   ?/delete — soft-delete (sets deleted_at = now())
 *
 * Scope-guard: only the Übersicht + Transaktionen tabs ship here. Other
 * tabs (Rechnungen / Auslagen / Belege / Verlauf) are Night-2 follow-ups.
 */

import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { files } from "$lib/server/db/schema/files.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { users } from "$lib/server/db/schema/users.js";
import {
  editProject,
  softDeleteProject,
} from "$lib/server/domain/projects-actions.js";
import { projectFinancials } from "$lib/server/domain/projects.js";
import { fileViewUrl } from "$lib/server/files/storage.js";

export const load: PageServerLoad = async ({ params, url }) => {
  const { id } = params;
  const db = getDb();

  // C1-PRJ-A: forward `?toast=` payload (set by /rechnungen/new redirect
  // after `?from=projekt` save). JSON.parse + shape-validate so a malformed
  // token degrades silently instead of crashing the page.
  let toast: { message: string; kind: "success" | "info" | "error" } | null =
    null;
  const toastRaw = url.searchParams.get("toast");
  if (toastRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(toastRaw)) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { message?: unknown }).message === "string" &&
        ["success", "info", "error"].includes(
          String((parsed as { kind?: unknown }).kind ?? ""),
        )
      ) {
        toast = parsed as {
          message: string;
          kind: "success" | "info" | "error";
        };
      }
    } catch {
      toast = null;
    }
  }

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    error(404, "Projekt nicht gefunden");
  }

  const p = rows[0];

  // Financials aggregate (5 KPI tiles + saldo pill) + the customer list
  // for EditProjectDialog's Default-Kunde combobox.
  const [financials, customerRows] = await Promise.all([
    projectFinancials(p.id),
    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(customers.name),
  ]);

  // Up to 50 most-recent transactions linked to the project. Income
  // sorts on geld_eingang_datum, expenses on rechnungsdatum. NULL dates
  // sort last so they don't crowd out dated rows.
  const txnRows = (await db.execute<{
    id: string;
    kind: "income" | "expense";
    bezeichnung: string;
    betrag_cents: string;
    datum: string | null;
    status: string;
  }>(sql`
    SELECT id::text, 'expense'::text AS kind, bezeichnung,
           betrag_cents::text,
           rechnungsdatum::text AS datum,
           status::text
      FROM expenses
     WHERE project_id = ${p.id}::uuid
    UNION ALL
    SELECT id::text, 'income'::text, bezeichnung,
           betrag_cents::text,
           geld_eingang_datum::text,
           'gebucht'::text
      FROM income
     WHERE project_id = ${p.id}::uuid
    ORDER BY datum DESC NULLS LAST
    LIMIT 50
  `)) as Array<{
    id: string;
    kind: "income" | "expense";
    bezeichnung: string;
    betrag_cents: string;
    datum: string | null;
    status: string;
  }>;

  const transactions = txnRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    bezeichnung: r.bezeichnung,
    betragCents: Number(r.betrag_cents),
    datum: r.datum,
    status: r.status,
  }));

  // --- Night-2 C1-PRJ-B/C tabs ---

  // Rechnungen tab: invoices linked to this project.
  const rechnungenRows = await db
    .select({
      id: invoices.id,
      projectId: invoices.projectId, // P2-B7: surface for e2e cross-project leak check
      businessId: invoices.businessId,
      bezeichnung: invoices.bezeichnung,
      customerName: invoices.customerNameSnapshot,
      nettoCents: invoices.nettoCents,
      bezahltAm: invoices.bezahltAm,
      rechnungsdatum: invoices.rechnungsdatum,
      faelligkeitsDatum: invoices.faelligkeitsDatum,
    })
    .from(invoices)
    .where(eq(invoices.projectId, p.id))
    .orderBy(desc(invoices.rechnungsdatum));

  const rechnungen = rechnungenRows.map((r) => ({
    id: r.id,
    projectId: p.id, // P2-B7: always this project's id (not the nullable FK)
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    customerName: r.customerName,
    nettoCents: Number(r.nettoCents),
    bezahltAm: r.bezahltAm ?? null,
    rechnungsdatum: r.rechnungsdatum,
    faelligkeitsDatum: r.faelligkeitsDatum ?? null,
  }));

  // Auslagen tab: submissions linked to this project via project_id FK.
  const auslagenRows = await db
    .select({
      id: auslagenSubmissions.id,
      ausId: auslagenSubmissions.businessId,
      bezeichnung: auslagenSubmissions.bezeichnung,
      bezahltVonDisplay: auslagenSubmissions.bezahltVonDisplay,
      betragCents: auslagenSubmissions.betragCents,
      decidedAt: auslagenSubmissions.decidedAt,
      decision: auslagenSubmissions.decision,
      submittedAt: auslagenSubmissions.submittedAt,
    })
    .from(auslagenSubmissions)
    .where(eq(auslagenSubmissions.projectId, p.id))
    .orderBy(desc(auslagenSubmissions.submittedAt));

  const auslagen = auslagenRows.map((a) => ({
    id: a.id,
    projectId: p.id, // P2-B7
    ausId: a.ausId,
    bezeichnung: a.bezeichnung,
    bezahltVonDisplay: a.bezahltVonDisplay,
    betragCents: Number(a.betragCents),
    status: (a.decidedAt == null
      ? "offen"
      : a.decision === "approved"
        ? "approved"
        : "rejected") as "offen" | "approved" | "rejected",
    submittedAt: a.submittedAt.toISOString(),
  }));

  // Belege tab: files attached via auslagen submissions linked to this project.
  // The files table does not have a direct linkedEntityId — we join through
  // auslagen_submissions.beleg_file_id where project_id = this project.
  const belegeRows = await db
    .select({
      id: files.id,
      originalFilename: files.originalFilename,
      mimeType: files.mimeType,
      byteSize: files.byteSize,
      sourceKind: files.sourceKind,
      uploadedAt: files.uploadedAt,
    })
    .from(files)
    .innerJoin(
      auslagenSubmissions,
      and(
        eq(auslagenSubmissions.belegFileId, files.id),
        eq(auslagenSubmissions.projectId, p.id),
      ),
    )
    .where(isNull(files.deletedAt))
    .orderBy(desc(files.uploadedAt));

  const belege = belegeRows.map((b) => ({
    id: b.id,
    projectId: p.id, // P2-B7
    originalFilename: b.originalFilename,
    mimeType: b.mimeType,
    byteSize: Number(b.byteSize),
    sourceKind: b.sourceKind,
    uploadedAt: b.uploadedAt.toISOString(),
    viewUrl: fileViewUrl(b.id),
  }));

  // Verlauf tab: audit_log entries for this project (direct entity match or
  // payload projectId reference). Newest-first, capped at 50.
  function summarisePayload(payload: unknown): string {
    if (!payload || typeof payload !== "object") return "";
    const obj = payload as Record<string, unknown>;
    const keys = ["bezeichnung", "betragCents", "name", "status"].filter(
      (k) => k in obj,
    );
    return keys.map((k) => `${k}: ${String(obj[k])}`).join(" · ");
  }

  const verlaufRows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityKind: auditLog.entityKind,
      entityId: auditLog.entityId,
      ts: auditLog.occurredAt,
      payload: auditLog.payload,
      userDisplay: sql<string>`coalesce(${users.name}, 'System')`,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(
      or(
        and(eq(auditLog.entityKind, "project"), eq(auditLog.entityId, p.id)),
        sql`${auditLog.payload}->>'projectId' = ${p.id}`,
      ),
    )
    .orderBy(desc(auditLog.occurredAt))
    .limit(50);

  const verlauf = verlaufRows.map((r) => ({
    id: r.id,
    projectId: p.id, // P2-B7
    action: r.action,
    entityKind: r.entityKind,
    entityId: r.entityId ?? null,
    actorDisplay: r.userDisplay,
    ts: r.ts.toISOString(),
    payloadSummary: summarisePayload(r.payload),
  }));

  return {
    project: {
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      sphereDefault: p.sphereDefault,
      startDate: p.startDate,
      endDate: p.endDate,
      notes: p.notes,
      defaultCustomerId: p.defaultCustomerId,
      isFixture: p.isFixture,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    },
    financials,
    transactions,
    customers: customerRows,
    toast,
    // Night-2 C1-PRJ-B/C tabs
    rechnungen,
    auslagen,
    belege,
    verlauf,
  };
};

export const actions: Actions = {
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    if (!raw["id"] && params.id) raw["id"] = params.id;

    const result = await editProject(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "edit",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "edit", success: true };
  },

  delete: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() || params.id || "";

    const result = await softDeleteProject(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },
};
