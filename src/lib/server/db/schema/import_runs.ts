/**
 * Importer provenance (ADR-0012).
 *
 * One row per legacy-sheet import run. Future re-applications check
 * `idempotency_key` and refuse without `--force-replace`. `source_hash`
 * is the SHA-256 of the export blob — protects against partial re-imports
 * with subtly different inputs.
 */

import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable identifier — e.g. 'sheet_import_2026_05_18'. */
    idempotencyKey: text("idempotency_key").notNull(),
    sourceHash: text("source_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** {expenses: 412, income: 87, donations: 23, members: 14, ...}. */
    rowCounts: jsonb("row_counts"),
    /** "ok" | "failed" | "rolled_back". */
    status: text("status").notNull().default("running"),
    errorMessage: text("error_message"),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    forceReplaceUsed: integer("force_replace_used").notNull().default(0),
  },
  (t) => ({
    idempotencyKeyUq: uniqueIndex("import_runs_idempotency_key_uq").on(
      t.idempotencyKey,
    ),
  }),
);
