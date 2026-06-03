/**
 * Per-year Beitragssatz table — §4 schema (Phase 1).
 *
 * Stores the Verein's annual membership fee (Mitgliedsbeitrag) with full
 * provenance: who decided it, when, and under which resolution (Beschluss).
 *
 * ADR-0003: monetary value stored as bigint cents.
 * ADR-0006: rows for festgeschriebene Jahre are immutable (enforced server-side).
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const beitragssatzByYear = pgTable(
  "beitragssatz_by_year",
  {
    year: integer("year").primaryKey(),
    /** Membership fee in euro cents (ADR-0003). Must be ≥ 0. */
    cents: bigint("cents", { mode: "bigint" }).notNull(),
    /** Fälligkeitsdatum (due date). Null → caller defaults to ${year}-03-31. */
    faelligkeitAt: date("faelligkeit_at"),
    /** When the decision was made (Beschlussdatum). */
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Admin who entered the decision. SET NULL if user is deleted. */
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Free-text reference to the MV resolution, e.g. "MV 14.03.2026, TOP 7". */
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    centsNonneg: check("beitragssatz_cents_nonneg_ck", sql`${t.cents} >= 0`),
  }),
);
