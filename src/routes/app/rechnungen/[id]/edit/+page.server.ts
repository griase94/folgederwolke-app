/**
 * /app/rechnungen/[id]/edit — edit an unpaid, open-year, non-superseded invoice
 * in place. Same form + live PDF preview as /new; submit hits the `?/edit`
 * action which calls `editInvoice()` and bumps the PDF version.
 *
 * load() rejects (403 page with German message) if the invoice is paid,
 * festgeschrieben, or already superseded. Defence-in-depth: the domain also
 * re-checks these guards.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { editInvoice } from "$lib/server/domain/invoices.js";
import { parseEuroToCents } from "$lib/domain/money.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params }) => {
  const db = getDb();
  const id = params.id;

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

  if (inv.bezahltAm) {
    throw error(
      403,
      "Bereits bezahlte Rechnungen können nicht mehr bearbeitet werden.",
    );
  }
  if (inv.festgeschriebenAt) {
    throw error(
      403,
      "Diese Rechnung ist festgeschrieben (Jahr abgeschlossen).",
    );
  }

  // Same predecessor/successor lookup as the detail page (lines ~66-71): is
  // this invoice already the predecessor of a newer correction?
  const [successor] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.supersedesId, id))
    .limit(1);
  if (successor) {
    throw error(
      403,
      "Diese Rechnung wurde bereits durch eine Korrektur ersetzt.",
    );
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
      .where(
        and(eq(kategorien.kind, "income"), eq(kategorien.deactivated, false)),
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
};
