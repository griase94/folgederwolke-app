/**
 * Event handlers — §4.1.1 #2.
 *
 * Registers in-process handlers on the shared bus. Call `registerHandlers()`
 * exactly once per cold start; the function is idempotent.
 *
 * Failure semantics:
 *   - Mail handler: best-effort. Logs and swallows errors so a transient mail
 *     outage does not propagate to the conductor (route action redirect).
 *   - Audit handler: critical. Re-throws so bus.emit() surfaces an
 *     AggregateError to the caller and operations are surfaced.
 */

import { bus } from "./bus.js";
import type { EventPayload } from "./types.js";
import { sendMail } from "$lib/server/mail/index.js";
import { getDb } from "$lib/server/db/index.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { logAudit } from "$lib/server/audit-log/index.js";

let registered = false;

export function registerHandlers(): void {
  if (registered) return;
  registered = true;

  // ── auslagen.submitted ──────────────────────────────────────────────────
  // Handler 1: send EingangsMail (best-effort).
  bus.on<EventPayload<"auslagen.submitted">>(
    "auslagen.submitted",
    async (payload) => {
      if (!payload.email) return;
      try {
        await sendMail({
          template: "auslage_eingang",
          entity_kind: "auslagen_submission",
          entity_id: payload.submissionId,
          to: payload.email,
          props: {
            vorname: payload.vorname,
            ausId: payload.ausId,
            bezeichnung: payload.bezeichnung,
            betragCents: payload.betragCents,
            eingereichtAm: new Date(),
          },
        });
      } catch (mailErr) {
        // Best-effort: log and swallow.
        console.error(
          `[events] EingangsMail failed for ${payload.ausId}:`,
          mailErr,
        );
      }
    },
  );

  // Handler 2: write audit log row (critical — re-throw on failure).
  bus.on<EventPayload<"auslagen.submitted">>(
    "auslagen.submitted",
    async (payload) => {
      const db = getDb();
      await db.insert(auditLog).values({
        actorKind: "system",
        action: "create",
        entityKind: "auslagen_submission",
        entityId: payload.submissionId,
        entityBusinessId: payload.ausId,
        actorIpPrefix: payload.ipPrefix,
        actorUaHash: payload.userAgentHash,
        payload: {
          bezeichnung: payload.bezeichnung,
          betragCents: payload.betragCents,
          bezahltVonKind: payload.bezahltVonKind,
          consentTextVersion: payload.consentTextVersion,
        },
      });
    },
  );

  // ── member.created ──────────────────────────────────────────────────────
  bus.on<EventPayload<"member.created">>("member.created", async (payload) => {
    await logAudit({
      action: "create",
      entityKind: "member",
      entityId: payload.memberId,
      actorUserId: payload.actorUserId,
      actorKind: payload.actorUserId ? "user" : "system",
      payload: payload.payload ?? {},
    });
  });

  // ── member.updated ──────────────────────────────────────────────────────
  bus.on<EventPayload<"member.updated">>("member.updated", async (payload) => {
    await logAudit({
      action: "update",
      entityKind: "member",
      entityId: payload.memberId,
      actorUserId: payload.actorUserId,
      actorKind: payload.actorUserId ? "user" : "system",
      payload: payload.payload ?? {},
    });
  });

  // ── member.deleted ──────────────────────────────────────────────────────
  bus.on<EventPayload<"member.deleted">>("member.deleted", async (payload) => {
    await logAudit({
      action: "delete",
      entityKind: "member",
      entityId: payload.memberId,
      actorUserId: payload.actorUserId,
      actorKind: payload.actorUserId ? "user" : "system",
      payload: payload.payload ?? {},
    });
  });

  // ── member.beitrag_paid ─────────────────────────────────────────────────
  // No `beitrag_paid` verb in audit_action enum; we use the closest match
  // (`update`) and tag the kind in the payload for the activity feed.
  bus.on<EventPayload<"member.beitrag_paid">>(
    "member.beitrag_paid",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "member",
        entityId: payload.memberId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: { kind: "beitrag_paid", ...(payload.payload ?? {}) },
      });
    },
  );
}

/** Test-only: clear the registration guard so a fresh registerHandlers() works. */
export function _resetHandlersForTest(): void {
  registered = false;
}
