/**
 * Server-only Mitglieder domain helpers.
 *
 * - validateAddMember / validateEditMember: Zod schemas + validation
 * - beitragYearsRange: returns the 3-year window centered on the anchor year
 *   (anchor − 1 … anchor + 1). Default anchor is the current calendar year.
 *
 * Client-safe types (MemberView, BeitragStatus, beitragStatusFor) live in
 * $lib/domain/members.ts to avoid the server-module restriction in browser code.
 */

import { z } from "zod";
import { validateIban, normalizeIban } from "$lib/server/domain/iban.js";

// Re-export shared client-safe items so callers that don't need browser
// compatibility can import everything from one place.
export type {
  BeitragStatus,
  BeitragCell,
  MemberView,
} from "$lib/domain/members.js";
export { beitragStatusFor } from "$lib/domain/members.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Accept a valid string, empty string, or absent value.
 * Empty string and absent both parse to undefined.
 */
function optionalText(schema: z.ZodString) {
  return z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.union([schema, z.undefined()]));
}

const memberBaseSchema = z.object({
  vorname: z
    .string()
    .min(1, "Vorname ist erforderlich")
    .max(80, "Vorname zu lang"),
  nachname: z
    .string()
    .min(1, "Nachname ist erforderlich")
    .max(80, "Nachname zu lang"),
  email: optionalText(
    z.string().email("Ungültige E-Mail").max(254, "E-Mail zu lang"),
  ),
  telefon: optionalText(z.string().max(30, "Telefon zu lang")),
  iban: z
    .string()
    .optional()
    .transform((v) =>
      v === "" || v === undefined ? undefined : normalizeIban(v),
    )
    .pipe(
      z.union([
        z
          .string()
          .max(34, "IBAN zu lang")
          .refine(validateIban, { message: "IBAN ungültig" }),
        z.undefined(),
      ]),
    ),
  adresse: optionalText(z.string().max(300, "Adresse zu lang")),
  date_of_birth: optionalText(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  ),
  eintritts_datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
    .default(() => new Date().toISOString().slice(0, 10)),
  role: z
    .enum([
      "vorstand",
      "kassenwart",
      "schriftfuehrer",
      "mitglied",
      "fördermitglied",
    ])
    .default("mitglied"),
});

export const addMemberSchema = memberBaseSchema;
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const editMemberSchema = memberBaseSchema.extend({
  id: z.string().uuid("Ungültige Mitglieds-ID"),
});
export type EditMemberInput = z.infer<typeof editMemberSchema>;

export function validateAddMember(
  data: Record<string, unknown>,
):
  | { success: true; data: AddMemberInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = addMemberSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

export function validateEditMember(
  data: Record<string, unknown>,
):
  | { success: true; data: EditMemberInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = editMemberSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

// ---------------------------------------------------------------------------
// Year helpers
// ---------------------------------------------------------------------------

/**
 * Returns the 3-year window centered on `anchor`: [anchor-1, anchor, anchor+1].
 * Default anchor is the current calendar year.
 *
 * C2-2: callers thread `?year=` through to anchor the matrix on the selected
 * Buchungsjahr instead of always showing currentYear ± 1.
 */
export function beitragYearsRange(
  anchor: number = new Date().getFullYear(),
): [number, number, number] {
  return [anchor - 1, anchor, anchor + 1];
}
