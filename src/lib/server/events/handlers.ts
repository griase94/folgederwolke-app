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
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { and, eq, isNull } from "drizzle-orm";

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

  // ── expense.approved ────────────────────────────────────────────────────
  // No mail on approval — the user already received the EingangsMail and will
  // be notified again on `expense.erstattet`. The handler just appends an
  // audit_log row so the activity feed reflects the state change.
  bus.on<EventPayload<"expense.approved">>(
    "expense.approved",
    async (payload) => {
      await logAudit({
        action: "approve",
        entityKind: "expense",
        entityId: payload.expenseId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          expenseBusinessId: payload.expenseBusinessId,
          submissionId: payload.submissionId,
          submissionBusinessId: payload.submissionBusinessId,
          betragCents: payload.betragCents,
          bezeichnung: payload.bezeichnung,
        },
      });
    },
  );

  // ── expense.erstattet ───────────────────────────────────────────────────
  // Two handlers: (1) ErstattungsMail (best-effort, deduped by sent_mails
  // UNIQUE — second emit is a no-op at the DB layer); (2) audit_log.
  bus.on<EventPayload<"expense.erstattet">>(
    "expense.erstattet",
    async (payload) => {
      if (!payload.email) return;
      try {
        await sendMail({
          template: "auslage_erstattet",
          entity_kind: "expense",
          entity_id: payload.expenseId,
          to: payload.email,
          props: {
            vorname: payload.vorname,
            ausId: payload.expenseBusinessId,
            bezeichnung: payload.bezeichnung,
            betragCents: payload.betragCents,
            verwendungszweck: payload.verwendungszweck,
            erstattungsAm: payload.erstattungsAm,
          },
        });
      } catch (mailErr) {
        // Best-effort: log and swallow so a transient mail outage does not
        // mask the successful DB write the user sees in the UI.
        console.error(
          `[events] ErstattungsMail failed for ${payload.expenseBusinessId}:`,
          mailErr,
        );
      }
    },
  );

  bus.on<EventPayload<"expense.erstattet">>(
    "expense.erstattet",
    async (payload) => {
      await logAudit({
        action: "reimburse",
        entityKind: "expense",
        entityId: payload.expenseId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          expenseBusinessId: payload.expenseBusinessId,
          betragCents: payload.betragCents,
          erstattungsAm: payload.erstattungsAm.toISOString(),
        },
      });
    },
  );

  // ── auslage.reviewed ────────────────────────────────────────────────────
  // Two handlers: (1) UPDATE auslagen_submissions.reviewed_at if NULL — first
  // admin to open the card "claims" the review; (2) write audit_log row.
  // Re-emit on subsequent opens is a no-op at the DB layer (WHERE reviewed_at
  // IS NULL guards the UPDATE) and produces no extra audit rows because we
  // only emit when reviewed_at was previously NULL (see route load).
  bus.on<EventPayload<"auslage.reviewed">>(
    "auslage.reviewed",
    async (payload) => {
      const db = getDb();
      await db
        .update(auslagenSubmissions)
        .set({ reviewedAt: new Date() })
        .where(
          and(
            eq(auslagenSubmissions.id, payload.submissionId),
            isNull(auslagenSubmissions.reviewedAt),
          ),
        );
    },
  );

  bus.on<EventPayload<"auslage.reviewed">>(
    "auslage.reviewed",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "auslagen_submission",
        entityId: payload.submissionId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: { kind: "reviewed", ausId: payload.ausId },
      });
    },
  );

  // ── auslage.rejected ────────────────────────────────────────────────────
  bus.on<EventPayload<"auslage.rejected">>(
    "auslage.rejected",
    async (payload) => {
      if (!payload.email) return;
      try {
        await sendMail({
          template: "auslage_abgelehnt",
          entity_kind: "auslagen_submission",
          entity_id: payload.submissionId,
          to: payload.email,
          props: {
            vorname: payload.vorname,
            ausId: payload.submissionBusinessId,
            bezeichnung: payload.bezeichnung,
            betragCents: payload.betragCents,
            grund: payload.grund,
            abgelehntAm: new Date(),
          },
        });
      } catch (mailErr) {
        console.error(
          `[events] RejectionMail failed for ${payload.submissionBusinessId}:`,
          mailErr,
        );
      }
    },
  );

  bus.on<EventPayload<"auslage.rejected">>(
    "auslage.rejected",
    async (payload) => {
      await logAudit({
        action: "reject",
        entityKind: "auslagen_submission",
        entityId: payload.submissionId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          submissionBusinessId: payload.submissionBusinessId,
          betragCents: payload.betragCents,
          bezeichnung: payload.bezeichnung,
          grund: payload.grund,
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
