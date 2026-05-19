/**
 * Audit log — append-only tamper-evident chain (ADR-0004).
 *
 * Phase 1 ONLY defines the columns. The hash-chain trigger (with advisory
 * lock + prev_hash / row_hash computation) is added in Phase 7.5 along
 * with the REVOKE statements that remove UPDATE/DELETE/TRUNCATE rights
 * from the `app_runtime` role.
 *
 * Notes for Phase 7.5:
 *   - REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;
 *   - Trigger uses pg_advisory_xact_lock(hashtext('audit_log_chain'))
 *     to serialize inserts before computing row_hash.
 *   - row_hash = sha256(prev_hash || canonical_json(row_without_hash))
 *   - Genesis row marker stored in settings.audit_chain_genesis_at.
 */
// TODO multi-tenant: add verein_id

import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditActionEnum, entityKindEnum } from "./enums.js";
import { users } from "./users.js";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // ON DELETE RESTRICT (changed from SET NULL in migration 0010): silently
    // mutating audit_log rows when a user is deleted corrupts the hash chain
    // (DSGVO review CRIT-07). Art. 17 erasure goes through pseudonymise()
    // which redacts payload fields rather than nulling the FK.
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    /** "user" (signed-in admin) or "system" (cron/import). Free text for breadth. */
    actorKind: text("actor_kind").notNull().default("user"),
    actorIpPrefix: text("actor_ip_prefix"),
    actorUaHash: text("actor_ua_hash"),

    action: auditActionEnum("action").notNull(),
    entityKind: entityKindEnum("entity_kind").notNull(),
    entityId: uuid("entity_id"),
    entityBusinessId: text("entity_business_id"),

    /** Free-form structured diff/payload. Append-only; never updated. */
    payload: jsonb("payload"),

    // --- Tamper-evidence (filled by trigger in Phase 7.5; nullable here). ---
    chainSeq: integer("chain_seq"),
    prevHash: text("prev_hash"),
    rowHash: text("row_hash"),
  },
  (t) => ({
    occurredAtIdx: index("audit_log_occurred_at_idx").on(t.occurredAt),
    entityIdx: index("audit_log_entity_idx").on(t.entityKind, t.entityId),
    actorIdx: index("audit_log_actor_idx").on(t.actorUserId, t.occurredAt),
    chainSeqIdx: index("audit_log_chain_seq_idx").on(t.chainSeq),
  }),
);
