/**
 * /app/kunden/[id] — Customer detail page.
 *
 * load()   → fetch customer by id (404 if not found)
 * actions:
 *   ?/edit   — edit master data
 *   ?/delete — soft-delete (sets deleted_at = now())
 */

import { error, fail } from "@sveltejs/kit";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  editCustomer,
  softDeleteCustomer,
} from "$lib/server/domain/customers-actions.js";
import { assertUuidOr404 } from "$lib/domain/uuid.js";

export const load: PageServerLoad = async ({ params }) => {
  // F14: a non-UUID id (bad bookmark/typo) would hit the uuid column as 22P02
  // → 500. Validate first → clean 404.
  const id = assertUuidOr404(params.id, "Kunde nicht gefunden");
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    error(404, "Kunde nicht gefunden");
  }

  const c = rows[0];

  const [rechnungenRows, projekteRows] = await Promise.all([
    db
      .select({
        id: invoices.id,
        businessId: invoices.businessId,
        bezeichnung: invoices.bezeichnung,
        nettoCents: invoices.nettoCents,
        bezahltAm: invoices.bezahltAm,
        rechnungsdatum: invoices.rechnungsdatum,
      })
      .from(invoices)
      .where(eq(invoices.customerId, c.id))
      .orderBy(desc(invoices.rechnungsdatum)),
    db
      .select({
        id: projects.id,
        businessId: projects.businessId,
        name: projects.name,
      })
      .from(projects)
      .where(
        and(eq(projects.defaultCustomerId, c.id), isNull(projects.deletedAt)),
      ),
  ]);

  return {
    customer: {
      id: c.id,
      name: c.name,
      anrede: c.anrede,
      addressBlock: c.addressBlock,
      country: c.country,
      email: c.email,
      notes: c.notes,
      isFixture: c.isFixture,
      deletedAt: c.deletedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    },
    rechnungen: rechnungenRows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      nettoCents: Number(r.nettoCents),
      bezahltAm: r.bezahltAm ?? null,
      rechnungsdatum: r.rechnungsdatum,
    })),
    projekte: projekteRows,
  };
};

export const actions: Actions = {
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    if (!raw.id && params.id) raw.id = params.id;

    const result = await editCustomer(raw, userId);
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

    const result = await softDeleteCustomer(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },
};
