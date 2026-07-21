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
  /** Structured postal address (Andy-Feedback 2026-07). `strasse` incl. Hausnr. */
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  /** Legacy free-text address block — superseded by strasse/plz/ort. */
  addressBlock: string | null;
  /** ISO 3166-1 alpha-2 country code. Defaults to 'DE'. */
  country: string;
  email: string | null;
  notes: string | null;
  isFixture: boolean;
  deletedAt: string | null;
  createdAt: string;
};

/**
 * List-row shape: a CustomerView plus the two invoice aggregates the Kunden
 * list needs (Aurora E1). `offenCents` = Σ brutto of unpaid invoices;
 * `invoiceCount` distinguishes "keine Rechnungen" (0) from "alles bezahlt"
 * (>0 with offenCents = 0). Assignable to CustomerView, so the same object
 * feeds the edit dialog untouched.
 */
export type CustomerListView = CustomerView & {
  offenCents: number;
  invoiceCount: number;
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

const customerBaseObject = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200, "Name zu lang"),
  anrede: optionalText(z.string().max(200, "Anrede zu lang")),
  // Structured postal address is MANDATORY (Andy-Feedback 2026-07). `strasse`
  // includes the Hausnummer. German errors; PLZ format is checked in the refine
  // below (country-aware — the 5-digit rule is German).
  strasse: z
    .string({ error: "Bitte Straße und Hausnummer angeben" })
    .trim()
    .min(1, "Bitte Straße und Hausnummer angeben")
    .max(200, "Straße zu lang"),
  plz: z
    .string({ error: "Bitte eine PLZ angeben" })
    .trim()
    .min(1, "Bitte eine PLZ angeben")
    .max(10, "PLZ zu lang"),
  ort: z
    .string({ error: "Bitte einen Ort angeben" })
    .trim()
    .min(1, "Bitte einen Ort angeben")
    .max(100, "Ort zu lang"),
  country: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toUpperCase() : "DE"))
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{2}$/, "Länder-Code muss 2 Buchstaben sein (z.B. DE)"),
    ),
  email: optionalText(
    z.string().email("Ungültige E-Mail").max(254, "E-Mail zu lang"),
  ),
  notes: optionalText(z.string().max(2000, "Notizen zu lang")),
});

// German PLZ is exactly 5 digits. Enforce that for DE only, so a valid AT/CH
// (4-digit) address isn't wrongly rejected. Non-DE just needs a non-empty PLZ
// (checked above). Applied to both add + edit.
function refinePlz(
  val: { country: string; plz: string },
  ctx: z.RefinementCtx,
): void {
  if (val.country === "DE" && !/^\d{5}$/.test(val.plz)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["plz"],
      message: "Deutsche PLZ muss 5 Ziffern haben (z. B. 80331)",
    });
  }
}

export const addCustomerSchema = customerBaseObject.superRefine(refinePlz);
export type AddCustomerInput = z.infer<typeof addCustomerSchema>;

export const editCustomerSchema = customerBaseObject
  .extend({
    id: z.string().uuid("Ungültige Kunden-ID"),
  })
  .superRefine(refinePlz);
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
