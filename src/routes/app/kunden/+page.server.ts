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
import { isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import {
  addCustomer,
  editCustomer,
  softDeleteCustomer,
  restoreCustomer,
} from "$lib/server/domain/customers-actions.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  const rows = await db
    .select()
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(customers.name);

  return {
    customers: rows.map((c) => ({
      id: c.id,
      name: c.name,
      anrede: c.anrede,
      addressBlock: c.addressBlock,
      email: c.email,
      notes: c.notes,
      isFixture: c.isFixture,
      deletedAt: c.deletedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
};

export const actions: Actions = {
  // ── Add customer ───────────────────────────────────────────────────────────
  default: async ({ request, locals }) => {
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
