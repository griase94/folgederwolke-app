/**
 * Sent mails — idempotency + bounce tracking (ADR-0005).
 *
 * UNIQUE on `(template, entity_kind, entity_id, send_attempt)`. Re-send
 * increments `send_attempt`. The bounce webhook (Phase 7.5) verifies the
 * row exists before incrementing, avoiding the dup-on-retry race.
 *
 * For mails not tied to an entity (e.g. admin debug pings), use
 * entity_kind='settings' + entity_id=NULL.
 */
// TODO multi-tenant: add verein_id

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { entityKindEnum, mailStatusEnum, mailTemplateEnum } from "./enums.js";

export const sentMails = pgTable(
  "sent_mails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    template: mailTemplateEnum("template").notNull(),
    entityKind: entityKindEnum("entity_kind").notNull(),
    entityId: uuid("entity_id"),
    sendAttempt: integer("send_attempt").notNull().default(1),

    /** Canonicalized recipient (for dedup + bounce-correlation). */
    toCanonical: text("to_canonical").notNull(),
    /** Display "Name <email>" — uses canonical for matching, display for headers. */
    toDisplay: text("to_display").notNull(),
    subject: text("subject").notNull(),

    status: mailStatusEnum("status").notNull().default("queued"),
    /** Provider message-id (SMTP message-id header / Resend id). */
    providerMessageId: text("provider_message_id"),
    providerResponse: jsonb("provider_response"),

    queuedAt: timestamp("queued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (t) => ({
    idempotencyUq: uniqueIndex("sent_mails_template_entity_attempt_uq").on(
      t.template,
      t.entityKind,
      t.entityId,
      t.sendAttempt,
    ),
    statusIdx: index("sent_mails_status_idx").on(t.status),
    queuedAtIdx: index("sent_mails_queued_at_idx").on(t.queuedAt),
    providerMessageIdIdx: index("sent_mails_provider_message_id_idx").on(
      t.providerMessageId,
    ),
  }),
);
