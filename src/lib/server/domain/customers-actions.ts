/**
 * Shared Kunden CRUD action helpers.
 *
 * Each function validates input, performs the DB write, and emits the
 * matching `customer.*` event on the in-process bus (audit log written by
 * the registered handler).
 *
 * §4.1.1 #2 (event bus for side effects).
 */

import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { customers } from "$lib/server/db/schema/customers.js";
import {
  validateAddCustomer,
  validateEditCustomer,
} from "$lib/server/domain/customers.js";
import { buildCustomerBriefblock } from "$lib/domain/customers.js";
import { bus } from "$lib/server/events/index.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ActionFailure = {
  ok: false;
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, unknown>;
};

export type AddCustomerResult =
  | { ok: true; customerId: string }
  | ActionFailure;
export type EditCustomerResult = { ok: true } | ActionFailure;
export type DeleteCustomerResult = { ok: true } | ActionFailure;
export type RestoreCustomerResult = { ok: true } | ActionFailure;

// ---------------------------------------------------------------------------
// addCustomer
// ---------------------------------------------------------------------------

export async function addCustomer(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<AddCustomerResult> {
  const result = validateAddCustomer(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const { name, anrede, strasse, plz, ort, country, email, notes } =
    result.data;

  // `address_block` is kept as a denormalized mirror of the structured fields
  // (assembled Briefblock) so the invoice snapshot + list subline keep reading
  // one field — the structured columns are the input source of truth.
  const addressBlock = buildCustomerBriefblock({ strasse, plz, ort });

  const inserted = await db
    .insert(customers)
    .values({
      name,
      anrede: anrede ?? null,
      strasse,
      plz,
      ort,
      addressBlock,
      country: country,
      email: email ?? null,
      notes: notes ?? null,
    })
    .returning({ id: customers.id });

  const customerId = inserted[0]?.id ?? "";

  await bus.emit("customer.created", {
    customerId,
    actorUserId,
    payload: { name, email: email ?? null },
  });

  return { ok: true, customerId };
}

// ---------------------------------------------------------------------------
// editCustomer
// ---------------------------------------------------------------------------

export async function editCustomer(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<EditCustomerResult> {
  const result = validateEditCustomer(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const { id, name, anrede, strasse, plz, ort, country, email, notes } =
    result.data;

  const addressBlock = buildCustomerBriefblock({ strasse, plz, ort });

  await db
    .update(customers)
    .set({
      name,
      anrede: anrede ?? null,
      strasse,
      plz,
      ort,
      addressBlock,
      country: country,
      email: email ?? null,
      notes: notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id));

  await bus.emit("customer.updated", {
    customerId: id,
    actorUserId,
    payload: { name, email: email ?? null },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// softDeleteCustomer
// ---------------------------------------------------------------------------

export async function softDeleteCustomer(
  customerId: string,
  actorUserId: string | null,
): Promise<DeleteCustomerResult> {
  if (!customerId) {
    return { ok: false, status: 400, error: "Fehlende Kunden-ID" };
  }

  const db = getDb();
  await db
    .update(customers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  await bus.emit("customer.deleted", {
    customerId,
    actorUserId,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// restoreCustomer — soft-undelete (clears deletedAt). Backs the undo toast
// shown after softDeleteCustomer. C9/UX-050.
// ---------------------------------------------------------------------------

export async function restoreCustomer(
  customerId: string,
  actorUserId: string | null,
): Promise<RestoreCustomerResult> {
  if (!customerId) {
    return { ok: false, status: 400, error: "Fehlende Kunden-ID" };
  }

  const db = getDb();
  await db
    .update(customers)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  await bus.emit("customer.updated", {
    customerId,
    actorUserId,
    payload: { restored: true },
  });

  return { ok: true };
}
