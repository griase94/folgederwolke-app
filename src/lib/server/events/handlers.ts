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
      await logAudit({
        action: "create",
        entityKind: "auslagen_submission",
        entityId: payload.submissionId,
        entityBusinessId: payload.ausId,
        actorKind: "system",
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

  // ── auslage.approved ────────────────────────────────────────────────────
  // ApprovalMail (best-effort). The handler is registered BEFORE expense.approved
  // so the approval confirmation mail fires in the same request as the audit row.
  bus.on<EventPayload<"auslage.approved">>("auslage.approved", async (p) => {
    if (!p.submitterEmail) return; // no recipient → no mail
    try {
      await sendMail({
        template: "auslage_approved",
        entity_kind: "auslagen_submission",
        entity_id: p.submissionId,
        send_attempt: p.send_attempt, // P2-B6: required for re-approve-after-reject
        to: p.submitterEmail,
        props: {
          vorname: p.vorname ?? "",
          ausId: p.submissionBusinessId,
          bezeichnung: p.bezeichnung,
          betragCents: p.betragCents,
          kategorie: p.kategorie,
          decidedAt: p.decidedAt,
        },
      });
    } catch (e) {
      console.error(
        `[events] ApprovalMail failed for ${p.submissionBusinessId}:`,
        e,
      );
    }
  });

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
  //
  // For verein-bezahlt expenses email is null (no external recipient), so the
  // mail handler is a no-op via the `if (!payload.email) return` guard. The
  // audit row is intentionally still written: it records the abfluss/sphere
  // state change (erstattetAm + abflussDatum set) for the activity feed.
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
  // A5 (TOCTOU): single handler that gates BOTH side-effects on RETURNING
  // from the UPDATE. Two concurrent route loads both pass the load()-level
  // wasUnreviewed check and both emit — but only the call whose UPDATE
  // actually mutates a row (RETURNING one row) writes the audit log. The
  // other sees an empty RETURNING set and is a clean no-op. Replaces the
  // previous split (handler-1 UPDATE, handler-2 audit) which double-audited.
  bus.on<EventPayload<"auslage.reviewed">>(
    "auslage.reviewed",
    async (payload) => {
      const db = getDb();
      const updated = await db
        .update(auslagenSubmissions)
        .set({ reviewedAt: new Date() })
        .where(
          and(
            eq(auslagenSubmissions.id, payload.submissionId),
            isNull(auslagenSubmissions.reviewedAt),
          ),
        )
        .returning({ id: auslagenSubmissions.id });
      if (updated.length === 0) {
        // Lost the race or already reviewed — no audit row.
        return;
      }
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

  // ── project.created ────────────────────────────────────────────────────
  bus.on<EventPayload<"project.created">>(
    "project.created",
    async (payload) => {
      await logAudit({
        action: "create",
        entityKind: "project",
        entityId: payload.projectId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── project.updated ─────────────────────────────────────────────────────
  bus.on<EventPayload<"project.updated">>(
    "project.updated",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "project",
        entityId: payload.projectId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── project.deleted ─────────────────────────────────────────────────────
  bus.on<EventPayload<"project.deleted">>(
    "project.deleted",
    async (payload) => {
      await logAudit({
        action: "delete",
        entityKind: "project",
        entityId: payload.projectId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── customer.created ────────────────────────────────────────────────────
  bus.on<EventPayload<"customer.created">>(
    "customer.created",
    async (payload) => {
      await logAudit({
        action: "create",
        entityKind: "customer",
        entityId: payload.customerId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── customer.updated ────────────────────────────────────────────────────
  bus.on<EventPayload<"customer.updated">>(
    "customer.updated",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "customer",
        entityId: payload.customerId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── customer.deleted ────────────────────────────────────────────────────
  bus.on<EventPayload<"customer.deleted">>(
    "customer.deleted",
    async (payload) => {
      await logAudit({
        action: "delete",
        entityKind: "customer",
        entityId: payload.customerId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    },
  );

  // ── invoice.created ─────────────────────────────────────────────────────
  bus.on<EventPayload<"invoice.created">>(
    "invoice.created",
    async (payload) => {
      await logAudit({
        action: "create",
        entityKind: "invoice",
        entityId: payload.invoiceId,
        entityBusinessId: payload.invoiceBusinessId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          customerId: payload.customerId,
          customerNameSnapshot: payload.customerNameSnapshot,
          bruttoCents: payload.bruttoCents,
        },
      });
    },
  );

  // ── invoice.pdf_generated ──────────────────────────────────────────────
  // Phase 11: the sha256 audit-log anchor (§ 14 UStG Unversehrtheit per
  // ADR-0012 §6) is written DIRECTLY inside finalizePdfJob, not through this
  // event handler — a handler throw must not be able to skip the anchor.
  // This subscription is reserved for future best-effort consumers (mail
  // templates, analytics, …) that don't carry the legal guarantee. None
  // exist today; we deliberately leave the slot unsubscribed.

  // ── invoice.superseded ─────────────────────────────────────────────────
  bus.on<EventPayload<"invoice.superseded">>(
    "invoice.superseded",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "invoice",
        entityId: payload.invoiceId,
        entityBusinessId: payload.invoiceBusinessId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          kind: "superseded",
          supersedesId: payload.supersedesId,
          supersedesBusinessId: payload.supersedesBusinessId,
        },
      });
    },
  );

  // ── expense.created / expense.updated / income.created / income.updated /
  // ── donation.created ───────────────────────────────────────────────────
  // Direct-entry CRUD events emitted by /app/transactions/neu (create) and
  // /app/transactions/[id] (update). Each handler writes a single audit_log
  // row keyed by the corresponding entity_kind + action. Approval and
  // reimbursement remain on their own events (expense.approved,
  // expense.erstattet) so the activity timeline can distinguish a master-
  // data edit from a workflow state change.
  const txAuditMap = [
    { event: "expense.created", entityKind: "expense", action: "create" },
    { event: "expense.updated", entityKind: "expense", action: "update" },
    { event: "income.created", entityKind: "income", action: "create" },
    { event: "income.updated", entityKind: "income", action: "update" },
    { event: "donation.created", entityKind: "donation", action: "create" },
  ] as const;
  for (const { event, entityKind, action } of txAuditMap) {
    bus.on<EventPayload<typeof event>>(event, async (payload) => {
      await logAudit({
        action,
        entityKind,
        entityId: payload.id,
        entityBusinessId: payload.businessId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: payload.payload ?? {},
      });
    });
  }

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

  // ── member.beitrag_unpaid ───────────────────────────────────────────────
  // Storno: a previously-paid Beitrag year was reversed. Re-throws on failure
  // (audit is critical — mirror the existing beitrag_paid handler pattern).
  bus.on<EventPayload<"member.beitrag_unpaid">>(
    "member.beitrag_unpaid",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "member",
        entityId: payload.memberId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          kind: "beitrag_unpaid",
          year: payload.year,
          prevPaidCents: payload.prevPaidCents, // number — JSON-safe (P0-F1)
          prevGezahltAm: payload.prevGezahltAm,
        },
      });
    },
  );

  // ── member.exempted ─────────────────────────────────────────────────────
  // Per-year Befreiung granted or revoked. Re-throws on failure.
  bus.on<EventPayload<"member.exempted">>(
    "member.exempted",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "member",
        entityId: payload.memberId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          kind: payload.exempt ? "exempt_granted" : "exempt_revoked",
          year: payload.year,
          reason: payload.reason,
          prevExempt: payload.prevExempt,
        },
      });
    },
  );

  // ── settings.beitragssatz_changed ──────────────────────────────────────
  // Annual Beitragssatz was updated. entityKind='settings'. Re-throws.
  //
  // audit_log.entity_id is a uuid column, but a Beitragssatz row is keyed by
  // year (integer), not a uuid. Leave entity_id null and carry the year in the
  // payload (Phase-2 fix: the original handler wrote a non-uuid string here,
  // which the uuid column rejected at INSERT time).
  bus.on<EventPayload<"settings.beitragssatz_changed">>(
    "settings.beitragssatz_changed",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "settings",
        entityId: null,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          kind: "beitragssatz_changed",
          year: payload.year,
          oldCents: payload.oldCents, // number — JSON-safe (P0-F1)
          newCents: payload.newCents, // number — JSON-safe (P0-F1)
          decisionNote: payload.decisionNote,
        },
      });
    },
  );

  // ── spende.created ──────────────────────────────────────────────────────
  bus.on<EventPayload<"spende.created">>("spende.created", async (payload) => {
    await logAudit({
      action: "create",
      entityKind: "donation",
      entityId: payload.donationId,
      entityBusinessId: payload.businessId,
      actorUserId: payload.actorUserId,
      actorKind: payload.actorUserId ? "user" : "system",
      payload: {
        betragCents: payload.betragCents,
        spendeKind: payload.spendeKind,
        memberId: payload.memberId,
      },
    });
  });

  // ── spende.edited ───────────────────────────────────────────────────────
  bus.on<EventPayload<"spende.edited">>("spende.edited", async (payload) => {
    await logAudit({
      action: "update",
      entityKind: "donation",
      entityId: payload.donationId,
      actorUserId: payload.actorUserId,
      actorKind: payload.actorUserId ? "user" : "system",
      payload: { kind: "edited" },
    });
  });

  // ── spende.bescheinigung_generated ──────────────────────────────────────
  // Audit-only in v1; mail-send remains a manual admin step (download +
  // attach PDF). Phase 2 can convert this to an automatic SendMail handler
  // once Aufwandsspende workflow lands.
  bus.on<EventPayload<"spende.bescheinigung_generated">>(
    "spende.bescheinigung_generated",
    async (payload) => {
      await logAudit({
        action: "update",
        entityKind: "donation",
        entityId: payload.donationId,
        actorUserId: payload.actorUserId,
        actorKind: payload.actorUserId ? "user" : "system",
        payload: {
          kind: "bescheinigung_generated",
          bescheinigungNr: payload.bescheinigungNr,
          betragCents: payload.betragCents,
        },
      });
    },
  );
}

/** Test-only: clear the registration guard so a fresh registerHandlers() works. */
export function _resetHandlersForTest(): void {
  registered = false;
}
