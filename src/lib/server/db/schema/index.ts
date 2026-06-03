/**
 * Schema barrel — re-exports every drizzle table + enum.
 *
 * `getDb()` in ../index.ts passes `* as schema` to drizzle so queries can
 * resolve relations. Keep imports alphabetic (post-enums) for review-clarity.
 */
export * from "./enums.js";
export * from "./audit_log.js";
export * from "./beitragssatz.js";
export * from "./auslagen_submissions.js";
export * from "./customers.js";
export * from "./donations.js";
export * from "./expenses.js";
export * from "./files.js";
export * from "./id_counters.js";
export * from "./import_runs.js";
export * from "./income.js";
export * from "./invoice_jobs.js";
export * from "./invoices.js";
export * from "./kategorien.js";
export * from "./mails.js";
export * from "./members.js";
export * from "./projects.js";
export * from "./settings.js";
export * from "./sphere_overrides.js";
export * from "./users.js";
export * from "./zahlungsarten.js";
