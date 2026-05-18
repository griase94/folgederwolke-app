/**
 * Audit log insert helper.
 *
 * Phase 1: plain INSERT — no hash-chain trigger yet (added Phase 7.5).
 * Phase 7.5 will also REVOKE UPDATE/DELETE/TRUNCATE from app_runtime.
 *
 * Usage: await logAudit({ action, entityKind, entityId, actorUserId, payload })
 */

import { getDb } from "$lib/server/db/index.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import type {
  auditActionEnum,
  entityKindEnum,
} from "$lib/server/db/schema/enums.js";

// Derive enum value types from drizzle enum definitions
type AuditAction = (typeof auditActionEnum.enumValues)[number];
type EntityKind = (typeof entityKindEnum.enumValues)[number];

export interface AuditEntry {
  action: AuditAction;
  entityKind: EntityKind;
  entityId: string | null;
  actorUserId: string | null;
  actorKind?: string;
  actorIpPrefix?: string;
  actorUaHash?: string;
  payload?: Record<string, unknown>;
}

/**
 * Minimal Drizzle writer interface — accepts either the singleton db client
 * or an in-flight transaction handle. Required so callers inside a
 * `db.transaction()` callback can write the audit row on the SAME connection
 * (and see rows they just inserted via FK satisfaction); otherwise the audit
 * insert hits a separate pooled connection, can't see the uncommitted user
 * row, and the `audit_log_actor_user_id_users_id_fk` constraint fires.
 */
type AuditWriter = Pick<ReturnType<typeof getDb>, "insert">;

/**
 * Insert an audit_log row. When invoked from inside a `db.transaction(tx => ...)`
 * callback, pass `tx` as the second argument so the insert participates in the
 * same transaction (see `AuditWriter` notes above).
 */
export async function logAudit(
  entry: AuditEntry,
  writer?: AuditWriter,
): Promise<void> {
  const db = writer ?? getDb();
  await db.insert(auditLog).values({
    action: entry.action,
    entityKind: entry.entityKind,
    entityId: entry.entityId ?? undefined,
    actorUserId: entry.actorUserId ?? undefined,
    actorKind: entry.actorKind ?? "user",
    actorIpPrefix: entry.actorIpPrefix,
    actorUaHash: entry.actorUaHash,
    payload: entry.payload ?? {},
  });
}
