/**
 * Pure domain helpers for Auslage-Einreichung.
 *
 * - validateAuslageInput: Zod schema + validation
 * - composeBezahltVonDisplay: write-time snapshot string per ADR-0007
 */

import { z } from "zod";
import { validateIban, normalizeIban } from "./iban.js";
import { ALLOWED_BELEG_MIMES } from "./file-validation.js";
import { isoCalendarDate } from "$lib/domain/date.js";
import { MAX_BATCH_ITEMS } from "./auslage-submit.js";

// ---------------------------------------------------------------------------
// Zod schema — shared between load() fixture and action validation
// ---------------------------------------------------------------------------

const bezahltVonVereinSchema = z
  .object({
    kind: z.literal("verein"),
    /**
     * White-label (Phase 1): runtime Verein name captured at import time so
     * the persisted `bezahlt_von_display` snapshot reflects the configured
     * Verein, not a hardcoded literal. Optional — falls back to "Verein" when
     * absent (older clients / no name configured). ADR-0007: 'verein' stays
     * the stable discriminator; this is display-only.
     */
    display_name: z.string().max(120, "Anzeigename zu lang").optional(),
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
     *
     * Uses the shared `isoCalendarDate` helper (real calendar-date round-trip)
     * rather than a bare `/^\d{4}-\d{2}-\d{2}$/` regex: a format-only regex
     * accepts impossible dates like `2026-02-30`, which then crash the
     * Postgres `::date` insert as an opaque 500 and orphan the already-uploaded
     * Beleg Blob. The helper rejects such dates as a clean 422 field error
     * before any Blob work or DB insert runs.
     */
    rechnungsdatum: isoCalendarDate,
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
 *   verein → "Folge der Wolke e.V." (runtime name) or "Verein" (fallback)
 *   member → "Mitglied: Max Mustermann"
 *   extern → "Extern: Jane Doe (DE25...3000)"
 */
export function composeBezahltVonDisplay(bv: BezahltVon): string {
  switch (bv.kind) {
    case "verein":
      // White-label: persist the runtime Verein name captured at import time;
      // fall back to the neutral "Verein" token when none was supplied.
      return bv.display_name?.trim() || "Verein";
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

// ---------------------------------------------------------------------------
// Public batch submission schema (Aurora A-flow S1)
// ---------------------------------------------------------------------------

/**
 * The public form is extern-only (ratified): one identity for the whole batch,
 * then N Auslage items. `kind` is implicit ('extern') — no payer radio. The
 * member/verein arms live in the portal + admin import (they still use the
 * discriminated `bezahltVonSchema` above), so this narrower schema is the ONLY
 * shape the public endpoint accepts (AC #1: a member/verein POST → 422).
 */
const externIdentitySchema = z
  .object({
    name: z.string().min(1, "Name ist erforderlich").max(120, "Name zu lang"),
    // F3: IBAN validated (mod-97) exactly as the single extern arm did.
    iban: z
      .string()
      .min(15, "IBAN zu kurz")
      .max(34, "IBAN zu lang")
      .transform((v) => normalizeIban(v))
      .refine(validateIban, "IBAN ungültig"),
    email: z.string().email("Ungültige E-Mail").max(254, "E-Mail zu lang"),
  })
  .strict();

const auslageBatchItemSchema = z
  .object({
    /** Correlates a field error back to its block in the UI. */
    client_key: z.string().min(1, "client_key fehlt").max(64),
    /** Per-item idempotency nonce (retry heals the batch, never splits it). */
    submission_nonce: z
      .string()
      .uuid("submission_nonce muss UUID v4 sein")
      .optional(),
    bezeichnung: z
      .string()
      .min(3, "Bezeichnung muss mindestens 3 Zeichen haben")
      .max(200, "Bezeichnung zu lang"),
    kommentar: z.string().max(1000, "Kommentar zu lang").optional().nullable(),
    // C2-TAX: real calendar date required per item (same helper as single arm).
    rechnungsdatum: isoCalendarDate,
    // F1: positive integer cents per item (ADR-0003).
    betrag_cents: z
      .number({ error: "Betrag muss eine Zahl sein" })
      .int("Betrag muss ein ganzzahliger Cent-Betrag sein")
      .positive("Betrag muss positiv sein")
      .max(1_000_000_00, "Betrag überschreitet Limit"),
    // Optional Projekt/Event NAME (persisted to `wofuer`, matching the existing
    // single-arm behaviour — there is no project_id FK column on submissions).
    wofuer: z.string().max(500).optional().nullable(),
  })
  .strict();

export const auslageBatchInputSchema = z
  .object({
    identity: externIdentitySchema,
    consent_text_version: z
      .string()
      .min(1, "Datenschutz-Version fehlt")
      .max(64, "Datenschutz-Version zu lang"),
    // F2: hard batch cap (mirrors submitAuslagenBatch's MAX_BATCH_ITEMS backstop).
    auslagen: z
      .array(auslageBatchItemSchema)
      .min(1, "Mindestens eine Auslage")
      .max(
        MAX_BATCH_ITEMS,
        `Maximal ${MAX_BATCH_ITEMS} Auslagen pro Einreichung`,
      ),
  })
  .strict();

export type AuslageBatchInput = z.infer<typeof auslageBatchInputSchema>;

export type BatchValidationSuccess = { ok: true; data: AuslageBatchInput };
export type BatchValidationFailure = {
  ok: false;
  /** Page-level errors (identity, consent, batch-shape). */
  formErrors: string[];
  /** identity.<field> → messages. */
  identityErrors: Record<string, string[]>;
  /** client_key → { field → messages }. */
  itemErrors: Record<string, Record<string, string[]>>;
};

/**
 * Validate a public batch payload, mapping each Zod issue back to the UI shape:
 * identity errors keyed by field, item errors keyed by the block's client_key
 * (not the array index — the client tracks blocks by client_key so a remove
 * mid-batch can't misalign the error to the wrong block).
 */
export function validateAuslageBatchInput(
  data: unknown,
): BatchValidationSuccess | BatchValidationFailure {
  const result = auslageBatchInputSchema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };

  // Resolve array indices to client_keys where possible (best-effort — a
  // malformed payload may not carry them, in which case the numeric index
  // stands in).
  const rawItems =
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { auslagen?: unknown }).auslagen)
      ? ((data as { auslagen: unknown[] }).auslagen as Array<{
          client_key?: unknown;
        }>)
      : [];

  const formErrors: string[] = [];
  const identityErrors: Record<string, string[]> = {};
  const itemErrors: Record<string, Record<string, string[]>> = {};

  for (const issue of result.error.issues) {
    const [head, second, third] = issue.path;
    if (head === "identity" && typeof second === "string") {
      (identityErrors[second] ??= []).push(issue.message);
    } else if (head === "auslagen" && typeof second === "number") {
      const key =
        typeof rawItems[second]?.client_key === "string"
          ? (rawItems[second]!.client_key as string)
          : String(second);
      const field = typeof third === "string" ? third : "_root";
      ((itemErrors[key] ??= {})[field] ??= []).push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { ok: false, formErrors, identityErrors, itemErrors };
}
