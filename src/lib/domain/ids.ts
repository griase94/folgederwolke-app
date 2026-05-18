/**
 * Branded ID types for type-safe entity references.
 *
 * Why: a `MemberId` and a `UserId` are both `string` at runtime but should not
 * be interchangeable at the type level. `as Brand<'X'>` is the lightest way to
 * achieve this in TypeScript without runtime overhead.
 *
 * Per architectural convention §4.1.1 — all IDs flowing through the domain
 * layer must be branded. Database-layer code (drizzle queries) returns plain
 * `string` and must be cast at the boundary.
 */

declare const __brand: unique symbol;
export type Brand<TName extends string> = { readonly [__brand]: TName };

export type UserId = string & Brand<"UserId">;
export type SessionId = string & Brand<"SessionId">;
export type MagicLinkId = string & Brand<"MagicLinkId">;
export type MemberId = string & Brand<"MemberId">;
export type MemberBeitragId = string & Brand<"MemberBeitragId">;
export type CustomerId = string & Brand<"CustomerId">;
export type ProjectId = string & Brand<"ProjectId">;
export type KategorieId = string & Brand<"KategorieId">;
export type ZahlungsartId = string & Brand<"ZahlungsartId">;
export type ExpenseId = string & Brand<"ExpenseId">;
export type IncomeId = string & Brand<"IncomeId">;
export type DonationId = string & Brand<"DonationId">;
export type InvoiceId = string & Brand<"InvoiceId">;
export type AuditLogId = string & Brand<"AuditLogId">;
export type AuslagenSubmissionId = string & Brand<"AuslagenSubmissionId">;
export type InvoiceJobId = string & Brand<"InvoiceJobId">;
export type SentMailId = string & Brand<"SentMailId">;
export type ImportRunId = string & Brand<"ImportRunId">;
export type SphereOverrideId = string & Brand<"SphereOverrideId">;

/**
 * Branded business_id strings (legacy A-IDs preserved by importer per ADR-0010).
 * Format: `<PREFIX>-<YYYY>-<NNN>` zero-padded.
 *  - E-2026-001 for Einnahmen (income)
 *  - A-2026-001 for Ausgaben (expenses)
 *  - S-2026-001 for Spenden (donations)
 *  - FDW-2026-001 for Invoices
 *  - B-2026-001 for Bescheinigungs-Nr (D10 — donations.bescheinigung_nr)
 *  - AUS-2026-001 for Auslagen-Submissions (public form)
 */
export type BusinessId = string & Brand<"BusinessId">;
export type BescheinigungsNr = string & Brand<"BescheinigungsNr">;

/** Helper to brand a raw string — only call at the trust boundary (DB read, validated input). */
export function asBranded<TBrand extends Brand<string>>(
  value: string,
): string & TBrand {
  return value as string & TBrand;
}
