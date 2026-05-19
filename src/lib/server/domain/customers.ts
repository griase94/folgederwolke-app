/**
 * Server-only Kunden domain helpers.
 *
 * - validateAddCustomer / validateEditCustomer: Zod schemas + validation
 *
 * CustomerView is the serializable shape returned to the client.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// View type (serializable — no Date objects)
// ---------------------------------------------------------------------------

export type CustomerView = {
  id: string;
  name: string;
  anrede: string | null;
  addressBlock: string | null;
  email: string | null;
  notes: string | null;
  isFixture: boolean;
  deletedAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

function optionalText(schema: z.ZodString) {
  return z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.union([schema, z.undefined()]));
}

const customerBaseSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200, "Name zu lang"),
  anrede: optionalText(z.string().max(200, "Anrede zu lang")),
  address_block: optionalText(z.string().max(500, "Adressblock zu lang")),
  email: optionalText(
    z.string().email("Ungültige E-Mail").max(254, "E-Mail zu lang"),
  ),
  notes: optionalText(z.string().max(2000, "Notizen zu lang")),
});

export const addCustomerSchema = customerBaseSchema;
export type AddCustomerInput = z.infer<typeof addCustomerSchema>;

export const editCustomerSchema = customerBaseSchema.extend({
  id: z.string().uuid("Ungültige Kunden-ID"),
});
export type EditCustomerInput = z.infer<typeof editCustomerSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateAddCustomer(
  data: Record<string, unknown>,
):
  | { success: true; data: AddCustomerInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = addCustomerSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

export function validateEditCustomer(
  data: Record<string, unknown>,
):
  | { success: true; data: EditCustomerInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = editCustomerSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}
