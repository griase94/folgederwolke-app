/**
 * /app/rechnungen/new — create a new invoice with live real-PDF preview.
 *
 * load()  → fetches customer + projekt + (income) kategorie lists for the form
 *           plus a next-business-id preview ("FDW-2026-007").
 *
 * Phase 11: the live preview is no longer rendered server-side as HTML — the
 * client POSTs to /api/rechnungen/preview which returns the real PDF bytes.
 * Only the `create` action lives here now.
 */

import { fail, redirect } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { idCounters } from "$lib/server/db/schema/id_counters.js";
import { createInvoice } from "$lib/server/domain/invoices.js";
import { berlinYear } from "$lib/domain/year.js";
import { parseEuroToCents } from "$lib/domain/money.js";

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

    // Convert nettoEur (form input) → nettoCents (domain input). Use the
    // canonical de-DE/English parser (F24) — never strip every dot, which
    // destroyed dot-decimals ("12.34") and produced 10×/100× wrong amounts.
    // The server is authoritative (it discards any client cents), so this is
    // the single point of truth. Invalid input → leave nettoCents undefined so
    // the Zod validator surfaces the proper error.
    const nettoEur = (raw["nettoEur"] as string | undefined) ?? "";
    try {
      raw["nettoCents"] = Number(parseEuroToCents(nettoEur));
    } catch {
      // empty / malformed — defer to the createInvoice Zod nettoCents error.
    }
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
};
