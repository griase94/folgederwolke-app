/**
 * /app/kunden — Kunden list page.
 *
 * load()    → fetches all non-archived customers ordered by name
 * actions:
 *   default (?/add)  → add a new customer
 *   ?/edit           → edit an existing customer
 *   ?/delete         → soft-delete (sets deleted_at = now())
 */

import { fail } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import {
  addCustomer,
  editCustomer,
  softDeleteCustomer,
  restoreCustomer,
} from "$lib/server/domain/customers-actions.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  // Archived customers ARE returned (Aurora E1 / plate kunden-v5): the list
  // renders them under a quiet "Archiviert · N" section, never in the active
  // stack. The client splits on `deletedAt`.
  const rows = await db.select().from(customers).orderBy(customers.name);

  // One GROUP BY join: Σ open Brutto + total invoice count per customer.
  // offenCents drives the "Offen an uns" fact; invoiceCount separates
  // "keine Rechnungen" (0) from "alles bezahlt" (>0, offen = 0).
  const agg = await db
    .select({
      customerId: invoices.customerId,
      offenCents: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.bezahltAm} IS NULL THEN ${invoices.bruttoCents} ELSE 0 END), 0)`,
      invoiceCount: sql<string>`COUNT(*)`,
    })
    .from(invoices)
    .groupBy(invoices.customerId);

  const aggMap = new Map(agg.map((a) => [a.customerId, a]));

  return {
    customers: rows.map((c) => {
      const a = aggMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        anrede: c.anrede,
        strasse: c.strasse,
        plz: c.plz,
        ort: c.ort,
        addressBlock: c.addressBlock,
        country: c.country,
        email: c.email,
        notes: c.notes,
        isFixture: c.isFixture,
        deletedAt: c.deletedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        offenCents: Number(a?.offenCents ?? 0),
        invoiceCount: Number(a?.invoiceCount ?? 0),
      };
    }),
  };
};

export const actions: Actions = {
  // ── Add customer ───────────────────────────────────────────────────────────
  // Named `add` — SvelteKit forbids mixing default with named actions.
  // AddCustomerDialog posts to `?/add`.
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

  // ── Edit customer ──────────────────────────────────────────────────────────
  edit: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

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

  // ── Soft-delete customer ───────────────────────────────────────────────────
  delete: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await softDeleteCustomer(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Restore soft-deleted customer (undo) ───────────────────────────────────
  restore: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await restoreCustomer(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "restore", error: result.error });
    }

    return { action: "restore", success: true };
  },
};
