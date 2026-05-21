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

import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "$lib/server/db/index.js";
import { validateIban, normalizeIban } from "$lib/server/domain/iban.js";
import { berlinYear } from "$lib/domain/year.js";

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
 * Default anchor is the current Berlin-local Buchhaltungsjahr (ADR-0001).
 *
 * C2-2: callers thread `?year=` through to anchor the matrix on the selected
 * Buchungsjahr instead of always showing currentYear ± 1.
 */
export function beitragYearsRange(
  // ADR-0001: Berlin-local default — using UTC `new Date().getFullYear()`
  // would shift the matrix window by one year at the UTC↔Berlin midnight
  // boundary.
  anchor: number = berlinYear(),
): [number, number, number] {
  return [anchor - 1, anchor, anchor + 1];
}

// ---------------------------------------------------------------------------
// C5-MEM-lite — Mitglieder-Matrix €-summen header aggregation
// ---------------------------------------------------------------------------

export interface MemberBeitragsTotals {
  /**
   * Total members in the `members` table (year-independent in this shipment).
   * Night-2 C5-MEM-full extends this with an `exemptCount` companion field.
   */
  memberCount: number;
  /** SUM(betrag_cents) where gezahlt_am IS NOT NULL, for the given year. */
  paidCents: number;
  /** SUM(betrag_cents) where gezahlt_am IS NULL, for the given year. */
  offenCents: number;
}

/**
 * Aggregate Mitglieds-Beiträge for one Buchungsjahr, used by the Mitglieder-
 * Matrix header line: `{N} Mitglieder · {X €} offen · {Y €} bezahlt`.
 *
 * Field semantics:
 *   - `memberCount` — total rows in the `members` table. Year-independent so
 *     the header member count stays stable when the user switches between
 *     years in the per-year tab switcher (the open/paid sums vary per year).
 *   - `paidCents`   — Σ betrag_cents WHERE gezahlt_am IS NOT NULL for `year`.
 *   - `offenCents`  — Σ betrag_cents WHERE gezahlt_am IS NULL     for `year`.
 *
 * Column names per `src/lib/server/db/schema/members.ts`:
 *   `betrag_cents`, `paid_cents`, `gezahlt_am` (NOT `bezahlt_am`).
 *
 * Members without any `member_beitrags` row for `year` contribute 0 to both
 * paid and offen — they're "not yet billed" rather than "owed".
 *
 * Returned cents values are plain `number` (cents fit comfortably in a JS
 * safe integer for any plausible Vereinsbeitrag total). ADR-0003 — never
 * stored as float.
 */
export async function memberBeitragsTotals(
  year: number,
): Promise<MemberBeitragsTotals> {
  const db = getDb();
  const rows = await db.execute<{
    member_count: string;
    paid_cents: string;
    offen_cents: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM members)::text AS member_count,
      COALESCE(SUM(CASE WHEN gezahlt_am IS NOT NULL THEN betrag_cents ELSE 0 END), 0)::text AS paid_cents,
      COALESCE(SUM(CASE WHEN gezahlt_am IS NULL     THEN betrag_cents ELSE 0 END), 0)::text AS offen_cents
    FROM member_beitrags
    WHERE year = ${year}
  `);
  const row = rows[0];
  return {
    memberCount: Number(row?.member_count ?? 0),
    paidCents: Number(row?.paid_cents ?? 0),
    offenCents: Number(row?.offen_cents ?? 0),
  };
}
