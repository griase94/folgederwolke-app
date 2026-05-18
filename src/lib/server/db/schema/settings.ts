/**
 * Key-value settings — the Verein's mutable parameters (mail template
 * bodies, IBAN/BIC, Mitgliedsbeitrag-per-Jahr, audit_chain_genesis_at, ...).
 *
 * Per-key value is jsonb so we can store strings, numbers, structured
 * objects (mail templates have `subject` + `body_html` + `body_text`).
 *
 * Settings reads are cached in-process for the request (settings repository
 * lives in Phase 2's domain layer); writes invalidate the cache.
 */

import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  /** Stable identifier — e.g. 'verein.iban', 'mail.template.magic_link.subject'. */
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
