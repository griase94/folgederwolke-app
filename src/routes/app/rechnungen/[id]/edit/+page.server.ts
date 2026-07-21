/**
 * /app/rechnungen/[id]/edit — edit an unpaid, open-year, non-superseded invoice
 * in place. Same form + live PDF preview as /new; submit hits the `?/edit`
 * action which calls `editInvoice()` and bumps the PDF version.
 *
 * load() returns `{ blocked: { reason, invoiceId, businessId } }` (Aurora E2
 * DELTA §6.4 — used to be a bare `error(403, msg)`) if the invoice is paid,
 * festgeschrieben, or already superseded, so +page.svelte can render a
 * designed lock page instead of SvelteKit's default error boundary.
 * Defence-in-depth: the domain (editInvoice) also re-checks these guards, so
 * a hand-crafted POST past the blocked load is still rejected server-side.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { editInvoice } from "$lib/server/domain/invoices.js";
import { addCustomer } from "$lib/server/domain/customers-actions.js";
import { parseEuroToCents } from "$lib/domain/money.js";
import { assertUuidOr404 } from "$lib/domain/uuid.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params }) => {
  const db = getDb();
  // F14: validate the uuid param first → clean 404 instead of a 22P02 500.
  const id = assertUuidOr404(params.id, "Rechnung nicht gefunden");

  // Fetch invoice (404 if missing). Mirror /[id]/+page.server.ts predecessor/
  // successor query for the superseded check.
  const [inv] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!inv) {
    throw error(404, "Rechnung nicht gefunden");
  }

  // Aurora E2 DELTA §6.4: these guards used to `throw error(403, msg)` —
  // SvelteKit's default error boundary is a bare, undesigned page. Return a
  // `blocked` shape instead so +page.svelte can render a proper lock page
  // (testid invoice-edit-blocked) with the same verbatim German reason text
  // and a way back to the invoice. Reasons kept byte-for-byte identical to
  // the prior error() messages — editInvoice() still re-checks all three
  // server-side (defence-in-depth), so this is presentation-only.
  let blockedReason: string | null = null;
  if (inv.bezahltAm) {
    blockedReason =
      "Bereits bezahlte Rechnungen können nicht mehr bearbeitet werden.";
  } else if (inv.festgeschriebenAt) {
    blockedReason = "Diese Rechnung ist festgeschrieben (Jahr abgeschlossen).";
  } else {
    // Same predecessor/successor lookup as the detail page (lines ~66-71): is
    // this invoice already the predecessor of a newer correction?
    const [successor] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.supersedesId, id))
      .limit(1);
    if (successor) {
      blockedReason =
        "Diese Rechnung wurde bereits durch eine Korrektur ersetzt.";
    }
  }

  if (blockedReason) {
    return {
      blocked: {
        reason: blockedReason,
        invoiceId: inv.id,
        businessId: inv.businessId,
      },
    } as const;
  }

  // Load the same option lists /new uses for the form selects.
  const [allCustomers, allProjects, incomeKategorien] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        addressBlock: customers.addressBlock,
        country: customers.country,
      })
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(customers.name),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.name),
    db
      .select({ id: kategorien.id, name: kategorien.name })
      .from(kategorien)
      // Only rechnungsfähige income Kategorien for NEW selections (Andy-Feedback
      // 2026-07), BUT always keep the invoice's CURRENT Kategorie in the list so
      // editing a legacy invoice whose Kategorie is now non-invoiceable doesn't
      // silently drop its selection.
      .where(
        and(
          eq(kategorien.kind, "income"),
          eq(kategorien.deactivated, false),
          inv.kategorieId
            ? or(
                eq(kategorien.rechnungsfaehig, true),
                eq(kategorien.id, inv.kategorieId),
              )
            : eq(kategorien.rechnungsfaehig, true),
        ),
      )
      .orderBy(kategorien.sortOrder, kategorien.name),
  ]);

  // Format nettoCents (bigint) as de-DE 2dp string for the form text input.
  const nettoCents = Number(inv.nettoCents);
  const nettoEur = (nettoCents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    blocked: null,
    invoice: {
      id: inv.id,
      businessId: inv.businessId,
    },
    customers: allCustomers,
    projects: allProjects,
    kategorien: incomeKategorien,
    invoiceNumberPreview: inv.businessId,
    today: new Date().toISOString().slice(0, 10),
    initial: {
      customerId: inv.customerId,
      kategorieId: inv.kategorieId ?? "",
      projectId: inv.projectId ?? "",
      rechnungsdatum: inv.rechnungsdatum,
      leistungsDatum: inv.leistungsDatum ?? "",
      faelligkeitsDatum: inv.faelligkeitsDatum ?? "",
      leistungszeitraum: inv.leistungszeitraum,
      bezeichnung: inv.bezeichnung,
      leistungsBeschreibung: inv.leistungsBeschreibung ?? "",
      nettoEur,
    },
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // InvoiceForm posts to `?/edit` (overridden via submitAction prop on this
  // route — see +page.svelte). Mirrors /new's `create` action exactly except
  // it calls editInvoice() and redirects to the detail page.
  edit: async ({ request, params, locals }) => {
    // F14: guard the action too (the load is already guarded) so a hand-crafted
    // POST to a non-UUID id yields 404, not a 22P02 500.
    assertUuidOr404(params.id, "Rechnung nicht gefunden");
    const actorUserId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") raw[k] = v;
    }

    // Convert nettoEur (form input) → nettoCents (domain input). Same
    // canonical de-DE/English parser as /new (F24). Invalid input → leave
    // nettoCents undefined so editInvoice's Zod validator surfaces the error.
    const nettoEur = (raw["nettoEur"] as string | undefined) ?? "";
    try {
      raw["nettoCents"] = Number(parseEuroToCents(nettoEur));
    } catch {
      // empty / malformed — defer to the editInvoice Zod nettoCents error.
    }
    delete raw["nettoEur"];

    const result = await editInvoice(params.id, raw, actorUserId);
    if (!result.ok) {
      return fail(result.status, {
        action: "edit",
        error: result.error,
        errors: result.errors,
        values: result.values ?? raw,
      });
    }

    throw redirect(303, `/app/rechnungen/${params.id}?job=${result.jobId}`);
  },

  // Aurora E2 DELTA §6.2: inline Quick-Add-Kunde, same thin wrapper as
  // /new and /app/kunden — AddCustomerDialog posts to `?/add` relative to
  // whichever page it's mounted on.
  add: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await addCustomer(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "add",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "add", success: true, customerId: result.customerId };
  },
};
