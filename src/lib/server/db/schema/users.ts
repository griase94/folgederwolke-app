/**
 * Auth-related tables — users, sessions, magic_links, rate_limit_attempts.
 *
 * Per ADR-0009 (hand-rolled magic-link discipline):
 *   - magic_links stores ONLY the hash; raw token never persisted
 *   - sessions has `last_used_at` for idle-timeout enforcement
 *   - rate_limit_attempts gives Postgres-backed sliding window
 *
 * Per ADR-0012:
 *   - users.role is an enum (not bool) to allow future steuerberater /
 *     member_self_service roles without a schema break.
 *
 * The auth-integration agent (next phase) writes the session resolver +
 * canonicalizeEmail-driven allowlist; this file only defines storage.
 */
// TODO multi-tenant: add verein_id

import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailCanonical: text("email_canonical").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("admin"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailCanonicalIdx: uniqueIndex("users_email_canonical_uq").on(
      t.emailCanonical,
    ),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Hashed session token (raw token only lives in cookie). */
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Device binding (ADR-0009 SHOULD-fix): hash of UA + IP-prefix at issue time. */
    deviceFingerprint: text("device_fingerprint"),
  },
  (t) => ({
    tokenHashUq: uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 of the raw token. Raw token NEVER persisted (ADR-0009). */
    tokenHash: text("token_hash").notNull(),
    /** Canonicalized requested email (for enumeration mitigation). */
    emailCanonical: text("email_canonical").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** IP-prefix + UA fingerprint of the click-through user; null until verify. */
    consumedFingerprint: text("consumed_fingerprint"),
  },
  (t) => ({
    tokenHashUq: uniqueIndex("magic_links_token_hash_uq").on(t.tokenHash),
    emailCanonicalIdx: index("magic_links_email_canonical_idx").on(
      t.emailCanonical,
    ),
    expiresAtIdx: index("magic_links_expires_at_idx").on(t.expiresAt),
  }),
);

/**
 * Postgres-backed sliding-window rate limiter (ADR-0009 + §7.6).
 * Each request appends a row keyed by `<endpoint>:<canonical-key>` (e.g.
 * "sign_in:user@example.com"). Counts within a window via the index.
 */
export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Optional metadata for audit ("ip:1.2.3.0/24", "ua_hash:..."). */
    meta: text("meta"),
  },
  (t) => ({
    keyOccurredAtIdx: index("rate_limit_attempts_key_occurred_at_idx").on(
      t.key,
      t.occurredAt.desc(),
    ),
  }),
);
