/**
 * /app/rechnungen/new — create a new invoice with live HTML preview.
 *
 * load()  → fetches customer + projekt + (income) kategorie lists for the form
 *           plus a next-business-id preview ("FDW-2026-007").
 *
 * actions:
 *   default  → validates and inserts via domain.createInvoice(). On success
 *              redirects to /app/rechnungen/{id}?job={jobId}.
 *   preview  → returns HTML string for the side-by-side preview pane.
 */

import { fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { idCounters } from "$lib/server/db/schema/id_counters.js";
import {
  createInvoice,
  renderInvoicePreviewHtml,
} from "$lib/server/domain/invoices.js";
import { env } from "$lib/server/env.js";
import { berlinYear } from "$lib/domain/year.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();

  // C1-PRJ-A: deep-link from ProjectCtaRail (+Rechnung) carries
  //   ?projectId=<uuid>&from=projekt
  // We use the project's default_customer_id to pre-fill the customer FK,
  // and the `from` token to drive the redirect-back-with-toast on save.
  const projectIdParam = url.searchParams.get("projectId");
  const fromParam = url.searchParams.get("from");
  const fromSafe = fromParam === "projekt" ? "projekt" : null;
  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  let prefillProjectId: string | null = null;
  let prefillCustomerId: string | null = null;
  if (projectIdParam && isUuid(projectIdParam)) {
    const projRow = await db
      .select({
        id: projects.id,
        defaultCustomerId: projects.defaultCustomerId,
      })
      .from(projects)
      .where(eq(projects.id, projectIdParam))
      .limit(1);
    const row = projRow[0];
    if (row) {
      prefillProjectId = row.id;
      prefillCustomerId = row.defaultCustomerId;
    }
  }

  const [allCustomers, allProjects, incomeKategorien, counterRows] =
    await Promise.all([
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
      db
        .select({ nextValue: idCounters.nextValue })
        .from(idCounters)
        .where(
          and(eq(idCounters.kind, "FDW"), eq(idCounters.year, berlinYear())),
        )
        .limit(1),
    ]);

  // Compute a preview business id — doesn't bump the counter; the real
  // allocation happens inside createInvoice(). Use Berlin-local year so the
  // preview matches what the allocator will pick on Dec 31 23:30 UTC (already
  // Jan 1 in Berlin) — ADR-0001.
  const year = berlinYear();
  const nextSeq = counterRows[0] ? Number(counterRows[0].nextValue) : 1;
  const invoiceNumberPreview = `FDW-${year}-${String(nextSeq).padStart(3, "0")}`;

  return {
    customers: allCustomers,
    projects: allProjects,
    kategorien: incomeKategorien,
    invoiceNumberPreview,
    today: new Date().toISOString().slice(0, 10),
    // C1-PRJ-A: prefill + redirect-back-with-toast plumbing.
    prefillProjectId,
    prefillCustomerId,
    from: fromSafe,
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // Named `create` — SvelteKit forbids mixing default with named actions.
  // InvoiceForm posts to `?/create`.
  create: async ({ request, locals, url }) => {
    const actorUserId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") raw[k] = v;
    }

    // Convert nettoEur (form input) → nettoCents (domain input)
    const nettoEur = (raw["nettoEur"] as string | undefined) ?? "";
    const cents = Math.round(
      parseFloat(nettoEur.replace(/\./g, "").replace(",", ".") || "0") * 100,
    );
    raw["nettoCents"] = cents;
    delete raw["nettoEur"];

    const result = await createInvoice(raw, actorUserId);
    if (!result.ok) {
      return fail(result.status, {
        action: "create",
        error: result.error,
        errors: result.errors,
        values: result.values ?? raw,
      });
    }

    // C1-PRJ-A: when launched from a project detail (?from=projekt with the
    // project id still on the form's hidden projectId field), bounce back
    // to the project detail page with a toast token in the URL.
    const fromParam = url.searchParams.get("from");
    const projectIdParam = url.searchParams.get("projectId");
    if (
      fromParam === "projekt" &&
      projectIdParam &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectIdParam,
      )
    ) {
      throw redirect(
        303,
        `/app/projekte/${projectIdParam}?toast=${encodeURIComponent(
          JSON.stringify({ message: "Rechnung erstellt.", kind: "success" }),
        )}`,
      );
    }

    throw redirect(
      303,
      `/app/rechnungen/${result.invoiceId}?job=${result.jobId}`,
    );
  },

  // Side-by-side preview pane — returns HTML for the form to inject.
  preview: async ({ request }) => {
    const fd = await request.formData();
    const v = (k: string): string => {
      const value = fd.get(k);
      return typeof value === "string" ? value : "";
    };
    const customerName = v("customerName");
    const customerAddressBlock = v("customerAddressBlock") || null;
    const customerCountry = v("customerCountry") || "DE";
    const rechnungsdatum =
      v("rechnungsdatum") || new Date().toISOString().slice(0, 10);
    const leistungsDatum = v("leistungsDatum") || null;
    const faelligkeitsDatum = v("faelligkeitsDatum") || null;
    const leistungszeitraum = v("leistungszeitraum") || null;
    const bezeichnung = v("bezeichnung");
    const leistungsBeschreibung = v("leistungsBeschreibung") || null;
    const currency = v("currency") || "EUR";
    const nettoCents = parseInt(v("nettoCents") || "0", 10) || 0;
    const ustCents = 0;
    const bruttoCents = nettoCents + ustCents;

    // Compute a fresh preview business id at render time (without bumping).
    const db = getDb();
    const counterRows = await db
      .select({ nextValue: idCounters.nextValue })
      .from(idCounters)
      .where(
        and(
          eq(idCounters.kind, "FDW"),
          eq(idCounters.year, new Date().getFullYear()),
        ),
      )
      .limit(1);
    void sql; // satisfy lint for the imported helper
    const year = berlinYear(); // ADR-0001: Berlin-local Buchhaltungsjahr
    const nextSeq = counterRows[0] ? Number(counterRows[0].nextValue) : 1;
    const invoiceNumberPreview = `FDW-${year}-${String(nextSeq).padStart(3, "0")}`;

    const html = renderInvoicePreviewHtml({
      bezeichnung,
      leistungsBeschreibung,
      rechnungsdatum,
      leistungsDatum,
      faelligkeitsDatum,
      leistungszeitraum,
      customerName,
      customerAddressBlock,
      customerCountry,
      nettoCents,
      ustCents,
      bruttoCents,
      currency,
      invoiceNumberPreview,
      verein: {
        name: env.VEREIN_NAME || "Folge der Wolke e.V.",
        adresse: env.VEREIN_ADRESSE || "",
        steuernummer: env.VEREIN_STEUERNUMMER || "",
        vereinsregister: env.VEREIN_VR || "",
      },
    });

    return { html };
  },
};
