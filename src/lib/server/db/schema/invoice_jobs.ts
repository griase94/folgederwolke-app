/**
 * Async invoice PDF generation jobs (§6.4).
 *
 * The Drive API call to copy a template Doc + write the data + export PDF
 * is slow (3-12s) and unreliable enough that we don't want to do it
 * synchronously inside a form action. A short-lived job row is enqueued;
 * a `Vercel cron` (Phase 7) polls and processes.
 *
 * `attempts` allows simple exponential backoff. Persistent failures expose
 * via `pdf_status='failed'` on the invoice row.
 */

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { invoiceJobStatusEnum } from "./enums.js";
import { invoices } from "./invoices.js";

export const invoiceJobs = pgTable(
  "invoice_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    /** Idempotency key — same invoice version produces the same key. */
    idempotencyKey: text("idempotency_key").notNull(),

    status: invoiceJobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),

    enqueuedAt: timestamp("enqueued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Wait until this time before retry (exponential backoff). */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  },
  (t) => ({
    idempotencyKeyUq: uniqueIndex("invoice_jobs_idempotency_key_uq").on(
      t.idempotencyKey,
    ),
    invoiceIdIdx: index("invoice_jobs_invoice_id_idx").on(t.invoiceId),
    statusNextAttemptIdx: index("invoice_jobs_status_next_attempt_idx").on(
      t.status,
      t.nextAttemptAt,
    ),
  }),
);
