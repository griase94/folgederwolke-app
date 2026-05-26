/**
 * Pure domain helpers for Auslage-Einreichung.
 *
 * - validateAuslageInput: Zod schema + validation
 * - composeBezahltVonDisplay: write-time snapshot string per ADR-0007
 */

import { z } from "zod";
import { validateIban, normalizeIban } from "./iban.js";
import { ALLOWED_BELEG_MIMES } from "./file-validation.js";

// ---------------------------------------------------------------------------
// Zod schema — shared between load() fixture and action validation
// ---------------------------------------------------------------------------

const bezahltVonVereinSchema = z
  .object({
    kind: z.literal("verein"),
  })
  .strict();

const bezahltVonMemberSchema = z
  .object({
    kind: z.literal("member"),
    member_id: z.string().uuid("Ungültige Mitglieds-ID"),
    /** Display name for the member — required for the display snapshot. */
    display_name: z
      .string()
      .min(1, "Anzeigename fehlt")
      .max(120, "Anzeigename zu lang"),
    /** Optional email for EingangsMail. */
    email: z
      .string()
      .email("Ungültige E-Mail")
      .max(254, "E-Mail zu lang")
      .optional(),
  })
  .strict();

const bezahltVonExternSchema = z
  .object({
    kind: z.literal("extern"),
    name: z.string().min(1, "Name ist erforderlich").max(120, "Name zu lang"),
    iban: z
      .string()
      .min(15, "IBAN zu kurz")
      .max(34, "IBAN zu lang")
      .transform((v) => normalizeIban(v))
      .refine(validateIban, "IBAN ungültig"),
    email: z.string().email("Ungültige E-Mail").max(254, "E-Mail zu lang"),
  })
  .strict();

const bezahltVonSchema = z.discriminatedUnion("kind", [
  bezahltVonVereinSchema,
  bezahltVonMemberSchema,
  bezahltVonExternSchema,
]);

export const auslageInputSchema = z
  .object({
    bezeichnung: z
      .string()
      .min(3, "Bezeichnung muss mindestens 3 Zeichen haben")
      .max(200, "Bezeichnung zu lang"),
    kommentar: z.string().max(1000, "Kommentar zu lang").optional(),
    /**
     * C2-TAX: required ISO YYYY-MM-DD. Tax-correctness gate — EÜR §11 EStG
     * requires the invoice date for every expense. Was `.optional().nullable()`
     * pre-C2-TAX which left a hole where Zod accepted a Beleg-less submission.
     */
    rechnungsdatum: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        "Rechnungsdatum im ISO-Format YYYY-MM-DD erforderlich",
      )
      .max(32),
    /** Amount in cents (integer). Positive only. */
    betragCents: z
      .number({ error: "Betrag muss eine Zahl sein" })
      .int("Betrag muss ein ganzzahliger Cent-Betrag sein")
      .positive("Betrag muss positiv sein")
      .max(1_000_000_00, "Betrag überschreitet Limit"),
    currency: z.string().length(3).default("EUR"),
    wofuer: z.string().max(500).optional().nullable(),
    bezahlt_von: bezahltVonSchema,
    /**
     * Original filename of the uploaded Beleg. C2-TAX: required (was optional)
     * — every Auslage must carry a Beleg. Action attaches this from the
     * multipart File header before Zod validation runs.
     */
    beleg_name: z
      .string()
      .min(1, "Beleg-Dateiname fehlt")
      .max(255, "Dateiname zu lang"),
    /**
     * MIME type of the uploaded Beleg — must be in the server-side allowlist.
     * The actual magic-byte verification happens in the action; this is just
     * the first gate. C2-TAX: required (was optional).
     */
    beleg_mime_type: z.enum(ALLOWED_BELEG_MIMES),
    /**
     * DSGVO snapshot — version of the Datenschutz text the submitter
     * agreed to. Compared against DATENSCHUTZ_VERSION in the action.
     */
    consent_text_version: z
      .string()
      .min(1, "Datenschutz-Version fehlt")
      .max(64, "Datenschutz-Version zu lang"),
    /**
     * Optional client-supplied nonce (UUIDv4) used for idempotent Drive
     * upload. The action generates one server-side if missing.
     * Coordinates with AuslagenForm.svelte which sends `submissionNonce`
     * (camelCase) in the JSON payload.
     */
    submissionNonce: z
      .string()
      .uuid("submissionNonce muss UUID v4 sein")
      .optional(),
  })
  .strict();

export type AuslageInput = z.infer<typeof auslageInputSchema>;
export type BezahltVon = z.infer<typeof bezahltVonSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationSuccess = { ok: true; data: AuslageInput };
export type ValidationFailure = {
  ok: false;
  errors: Record<string, string[]>;
};

export function validateAuslageInput(
  data: unknown,
): ValidationSuccess | ValidationFailure {
  const result = auslageInputSchema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  // Flatten Zod errors into a record of field → messages[]
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!errors[key]) errors[key] = [];
    errors[key]!.push(issue.message);
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// ADR-0007: composeBezahltVonDisplay
// ---------------------------------------------------------------------------

/**
 * Produces a stable, human-readable write-time snapshot of who paid.
 * Stored in bezahlt_von_display on insert — never recomputed from live data.
 *
 * Examples:
 *   verein → "Verein"
 *   member → "Mitglied: Max Mustermann"
 *   extern → "Extern: Jane Doe (DE25...3000)"
 */
export function composeBezahltVonDisplay(bv: BezahltVon): string {
  switch (bv.kind) {
    case "verein":
      return "Verein";
    case "member":
      return `Mitglied: ${bv.display_name}`;
    case "extern": {
      // Mask IBAN: show first 4 chars + last 4 chars with "..." in between
      const iban = bv.iban;
      const masked =
        iban.length > 8 ? `${iban.slice(0, 4)}...${iban.slice(-4)}` : iban;
      return `Extern: ${bv.name} (${masked})`;
    }
  }
}
