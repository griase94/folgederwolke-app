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

export async function logAudit(entry: AuditEntry): Promise<void> {
  const db = getDb();
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
