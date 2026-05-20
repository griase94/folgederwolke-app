/**
 * Domain helpers for the Audit Inbox admin path (Phase 4).
 *
 * Exports:
 *  - manualImportSubmission: insert an auslagen_submission as if submitted via
 *    the public form, but marks source as 'admin_entry' and skips Drive upload
 *    when no Beleg is provided.
 *  - approveSubmission: atomically create an `expenses` row (status='geprueft',
 *    approved_at = now()) AND mark the submission decided. Idempotent: a
 *    second call returns the existing expense row instead of inserting again.
 *  - rejectSubmission: mark the submission rejected (no expense row created)
 *    and emit the `auslage.rejected` event so the bus handler fires the
 *    RejectionMail + audit log.
 *  - markExpenseErstattet: set `erstattet_am` + `zahlungsart_id` and emit
 *    `expense.erstattet` so the bus handler fires ErstattungsMail (dedup'd by
 *    sent_mails UNIQUE).
 *
 * §4.1.1 #2 (event bus for side effects), ADR-0005 (mail idempotency),
 * ADR-0006 (Festschreibung), ADR-0007 (bezahlt_von discriminated copy).
 */

import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { members } from "$lib/server/db/schema/members.js";
import { bus } from "$lib/server/events/index.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import {
  composeBezahltVonDisplay,
  type BezahltVon,
} from "$lib/server/domain/auslagen.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";
import { berlinYear } from "$lib/domain/year.js";

// ---------------------------------------------------------------------------
// manualImportSubmission
// ---------------------------------------------------------------------------

export interface ManualImportInput {
  bezahlt_von: BezahltVon;
  bezeichnung: string;
  kommentar?: string | null;
  rechnungsdatum?: string | null;
  betragCents: number;
  currency?: string;
  wofuer?: string | null;
  /** Set when admin uploads a Beleg via Drive before calling this helper. */
  belegDriveFileId?: string | null;
  belegOriginalName?: string | null;
  /** UUID of the admin user performing the import (for audit log). */
  actorUserId: string;
}

export interface ManualImportResult {
  submissionId: string;
  ausId: string;
}

/**
 * Insert an auslagen_submission on behalf of someone — the "paper receipt
 * phone-in" admin path. Mirrors the public form action logic but:
 *
 *  - skips rate limiting (admin-only gate in calling route action)
 *  - skips Drive upload (caller pre-uploads if needed, passes belegDriveFileId)
 *  - sets `source` discriminator in audit payload to 'admin_entry'
 *  - emits `auslagen.submitted` on the bus → same EingangsMail + audit handlers
 *    as the public form
 */
export async function manualImportSubmission(
  input: ManualImportInput,
): Promise<ManualImportResult> {
  const bv = input.bezahlt_von;

  // ── 1. Allocate business ID (Berlin TZ) ──────────────────────────────────
  const year = berlinYear();
  const ausId = await allocateBusinessId("AUS", year);

  // ── 2. Insert DB row ──────────────────────────────────────────────────────
  const db = getDb();
  const [insertedRow] = await db
    .insert(auslagenSubmissions)
    .values({
      businessId: ausId,
      bezeichnung: input.bezeichnung,
      kommentar: input.kommentar ?? null,
      rechnungsdatum: input.rechnungsdatum ?? null,
      betragCents: BigInt(input.betragCents),
      currency: input.currency ?? "EUR",
      wofuer: input.wofuer ?? null,
      bezahltVonKind: bv.kind,
      bezahltVonMemberId: bv.kind === "member" ? bv.member_id : null,
      externName: bv.kind === "extern" ? bv.name : null,
      externIban: bv.kind === "extern" ? bv.iban : null,
      externEmail: bv.kind === "extern" ? bv.email : null,
      bezahltVonDisplay: composeBezahltVonDisplay(bv),
      belegDriveFileId: input.belegDriveFileId ?? null,
      belegOriginalName: input.belegOriginalName ?? null,
      // Admin-entry: no submitter fingerprint (the admin is the actor)
      submitterIpPrefix: null,
      submitterUaHash: null,
      // Consent is implicit for admin entries — store current version
      consentTextVersion: DATENSCHUTZ_VERSION,
    })
    .returning({ id: auslagenSubmissions.id });

  if (!insertedRow) {
    throw new Error(
      `[manual-import] INSERT auslagen_submissions returned no row for ${ausId}`,
    );
  }
  const submissionId = insertedRow.id;

  // ── 3. Emit domain event (EingangsMail + audit log via registered handlers) ──
  const recipientEmail =
    bv.kind === "extern"
      ? bv.email
      : bv.kind === "member"
        ? (bv.email ?? null)
        : null;

  const vorname =
    bv.kind === "member"
      ? (bv.display_name.split(" ")[0] ?? bv.display_name)
      : bv.kind === "extern"
        ? (bv.name.split(" ")[0] ?? bv.name)
        : "Mitglied";

  // bus.emit may throw AggregateError if audit handler fails — let it bubble
  // to the calling action so the 500 surface is correct.
  await bus.emit("auslagen.submitted", {
    submissionId,
    ausId,
    email: recipientEmail,
    vorname,
    bezeichnung: input.bezeichnung,
    betragCents: input.betragCents,
    driveFileId: input.belegDriveFileId ?? null,
    consentTextVersion: DATENSCHUTZ_VERSION,
    // Admin entry — no real IP/UA. Use actor UUID as a stable sentinel.
    ipPrefix: `admin:${input.actorUserId.slice(0, 8)}`,
    userAgentHash: randomUUID().replace(/-/g, "").slice(0, 8),
    bezahltVonKind: bv.kind,
  });

  return { submissionId, ausId };
}

// ---------------------------------------------------------------------------
// Festschreibung helper (ADR-0006)
// ---------------------------------------------------------------------------

/**
 * Returns the year stored under settings key `festgeschrieben_bis`, or `null`
 * if not set. Years <= this value are immutable.
 *
 * Mirrors `members-actions.fetchFestgeschriebenBis` — kept local so the
 * inbox actions don't pull in unrelated member domain code.
 */
async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Compute the Buchungsjahr (Europe/Berlin) used for the Festschreibung gate
 * given a submission's `rechnungsdatum`. Falls back to the current Berlin
 * year when rechnungsdatum is null. ADR-0001 + ADR-0006.
 */
function buchungsjahrForSubmission(rechnungsdatum: string | null): number {
  if (rechnungsdatum) {
    // YYYY-MM-DD — slice the year. The receipt date is already TZ-agnostic.
    const y = parseInt(rechnungsdatum.slice(0, 4), 10);
    if (Number.isFinite(y)) return y;
  }
  return berlinYear();
}

// ---------------------------------------------------------------------------
// approveSubmission
// ---------------------------------------------------------------------------

export interface ApproveSubmissionInput {
  submissionId: string;
  actorUserId: string;
}

export type ApproveSubmissionResult =
  | {
      ok: true;
      /** True when this call created the expense; false when an earlier call already did. */
      created: boolean;
      expenseId: string;
      expenseBusinessId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Approve an audit-inbox submission — atomically:
 *   1. Insert an `expenses` row with `status='geprueft'`, `approved_at = now()`,
 *      `approved_by_user_id = actorUserId`, copying bezahlt_von discriminated
 *      union fields (ADR-0007), with `source='form'` + `source_ref = ausId`.
 *   2. Update the submission to set `decided_at`, `decision='approved'`,
 *      `decided_by_user_id`, and `approved_expense_id`.
 *
 * Idempotency:
 *   - If submission row's `approved_expense_id` is already set, return that
 *     expense id and `created: false`. No re-insert.
 *   - The two writes happen inside a single `db.transaction` so a partial
 *     state can never persist; if INSERT fails the UPDATE is rolled back.
 *
 * Festschreibung gate (ADR-0006):
 *   - Compute Buchungsjahr from `rechnungsdatum` (else current Berlin year)
 *     and reject if <= settings.festgeschrieben_bis.
 *
 * Event:
 *   - Emits `expense.approved` AFTER the transaction commits (audit handler
 *     writes audit_log). Skipped on the idempotent no-op path.
 *
 * Business ID: the new `expenses` row reuses the submission's AUS-* business
 * id so the audit trail stays anchored to a single identifier from submit
 * through reimbursement.
 */
export async function approveSubmission(
  input: ApproveSubmissionInput,
): Promise<ApproveSubmissionResult> {
  const { submissionId, actorUserId } = input;
  if (!submissionId) {
    return { ok: false, status: 400, error: "Fehlende Submission-ID" };
  }

  const db = getDb();

  // ── 1. Load the submission ─────────────────────────────────────────────
  const subRows = await db
    .select()
    .from(auslagenSubmissions)
    .where(eq(auslagenSubmissions.id, submissionId))
    .limit(1);

  const submission = subRows[0];
  if (!submission) {
    return { ok: false, status: 404, error: "Einreichung nicht gefunden" };
  }

  // ── 1a. Idempotency short-circuit ──────────────────────────────────────
  if (submission.approvedExpenseId) {
    const existingRows = await db
      .select({ id: expenses.id, businessId: expenses.businessId })
      .from(expenses)
      .where(eq(expenses.id, submission.approvedExpenseId))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      return {
        ok: true,
        created: false,
        expenseId: existing.id,
        expenseBusinessId: existing.businessId,
      };
    }
    // approvedExpenseId set but row missing — inconsistent state. Refuse
    // rather than silently re-inserting (manual intervention required).
    return {
      ok: false,
      status: 409,
      error:
        "Einreichung verweist auf nicht existierende Buchung — bitte prüfen",
    };
  }

  // ── 1b. Reject if a previous decision was 'rejected' ───────────────────
  if (submission.decision === "rejected") {
    return {
      ok: false,
      status: 409,
      error: "Einreichung wurde bereits abgelehnt",
    };
  }

  // ── 2. Festschreibung gate (ADR-0006) ──────────────────────────────────
  const buchungsjahr = buchungsjahrForSubmission(submission.rechnungsdatum);
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null && buchungsjahr <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Jahr ${buchungsjahr} ist festgeschrieben`,
    };
  }

  // ── 3. Atomic transaction: INSERT expense + UPDATE submission ──────────
  // A1 (TOCTOU): two concurrent calls both read approvedExpenseId=NULL above
  // and both reach the INSERT. The `expenses.business_id` UNIQUE index makes
  // the loser fail with Postgres SQLSTATE 23505. We catch that, re-read the
  // submission inside this same transaction (now the winner's UPDATE is
  // visible thanks to row-level locking on REPEATABLE READ / read-committed
  // snapshot of the SELECT) and return the existing expense as the idempotent
  // result. The audit-emit branch is NOT taken on this path — `created=false`
  // signals the caller no side-effect fired.
  const expenseBusinessId = submission.businessId;
  const bezahltVonKind = submission.bezahltVonKind;

  type ApproveTxResult =
    | { kind: "created"; id: string; businessId: string }
    | { kind: "existed"; id: string; businessId: string };

  const result = await db.transaction(async (tx): Promise<ApproveTxResult> => {
    try {
      const [insertedExpense] = await tx
        .insert(expenses)
        .values({
          businessId: expenseBusinessId,
          source: "form",
          sourceRef: submission.businessId,
          // gebuchtAm defaults to now(); the year_for_booking() generated
          // column derives year_of_buchung from it.
          rechnungsdatum: submission.rechnungsdatum ?? null,
          betragCents: submission.betragCents,
          currency: submission.currency,
          bezeichnung: submission.bezeichnung,
          kommentar: submission.kommentar ?? null,
          // ADR-0002 snapshots — placeholders until the admin assigns
          // kategorie + sphere on the transaction detail page (Phase 5).
          kategorieNameSnapshot: "(Unkategorisiert)",
          sphereSnapshot: "ideeller",
          // ADR-0007: copy discriminator + extern fields verbatim.
          bezahltVonKind: bezahltVonKind,
          bezahltVonMemberId: submission.bezahltVonMemberId,
          externName: submission.externName,
          externIban: submission.externIban,
          externEmail: submission.externEmail,
          bezahltVonDisplay: submission.bezahltVonDisplay,
          belegDriveFileId: submission.belegDriveFileId,
          belegOriginalName: submission.belegOriginalName,
          status: "geprueft",
          approvedAt: new Date(),
          approvedByUserId: actorUserId,
          createdByUserId: actorUserId,
        })
        .returning({ id: expenses.id, businessId: expenses.businessId });

      if (!insertedExpense) {
        throw new Error(
          `[approveSubmission] INSERT expenses returned no row for ${expenseBusinessId}`,
        );
      }

      // A4: also bump reviewed_at if not already set, so the audit invariant
      // "reviewed before decided" never breaks (e.g. when approve happens
      // without the load() ever firing — direct POST, automated tooling).
      await tx
        .update(auslagenSubmissions)
        .set({
          decidedAt: new Date(),
          decision: "approved",
          decidedByUserId: actorUserId,
          approvedExpenseId: insertedExpense.id,
          reviewedAt: sql`COALESCE(${auslagenSubmissions.reviewedAt}, now())`,
        })
        .where(eq(auslagenSubmissions.id, submissionId));

      return {
        kind: "created",
        id: insertedExpense.id,
        businessId: insertedExpense.businessId,
      };
    } catch (insertErr) {
      // Postgres unique-violation: another concurrent call won the race.
      if (isUniqueViolation(insertErr)) {
        const subRow = await tx
          .select({ approvedExpenseId: auslagenSubmissions.approvedExpenseId })
          .from(auslagenSubmissions)
          .where(eq(auslagenSubmissions.id, submissionId))
          .limit(1);
        const approvedExpenseId = subRow[0]?.approvedExpenseId ?? null;
        if (approvedExpenseId) {
          const expRow = await tx
            .select({ id: expenses.id, businessId: expenses.businessId })
            .from(expenses)
            .where(eq(expenses.id, approvedExpenseId))
            .limit(1);
          const existing = expRow[0];
          if (existing) {
            return {
              kind: "existed",
              id: existing.id,
              businessId: existing.businessId,
            };
          }
        }
        // Fallback: the winner inserted by business_id but submission UPDATE
        // hasn't landed yet (rare with READ COMMITTED). Look up by businessId.
        const expByBiz = await tx
          .select({ id: expenses.id, businessId: expenses.businessId })
          .from(expenses)
          .where(eq(expenses.businessId, expenseBusinessId))
          .limit(1);
        const winner = expByBiz[0];
        if (winner) {
          return {
            kind: "existed",
            id: winner.id,
            businessId: winner.businessId,
          };
        }
      }
      throw insertErr;
    }
  });

  // ── 4. Emit event (audit log written by handler) ───────────────────────
  // A6: do NOT swallow handler errors here. The audit handler MUST surface
  // failures to the caller (registered as critical in handlers.ts spec) so
  // operations can recover. AggregateError propagates from bus.emit.
  if (result.kind === "created") {
    await bus.emit("expense.approved", {
      expenseId: result.id,
      expenseBusinessId: result.businessId,
      submissionId,
      submissionBusinessId: submission.businessId,
      actorUserId,
      betragCents: Number(submission.betragCents),
      bezeichnung: submission.bezeichnung,
    });
  }

  return {
    ok: true,
    created: result.kind === "created",
    expenseId: result.id,
    expenseBusinessId: result.businessId,
  };
}

// ---------------------------------------------------------------------------
// Postgres error helpers
// ---------------------------------------------------------------------------

/**
 * True if `err` is a Postgres unique-violation (SQLSTATE 23505). Different
 * drivers expose the code at different paths (postgres-js → `err.code`,
 * pg → `err.code`, drizzle wraps with `cause`). Walk the chain defensively.
 */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur) {
      const code = (cur as { code?: unknown }).code;
      if (code === "23505") return true;
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// rejectSubmission
// ---------------------------------------------------------------------------

export interface RejectSubmissionInput {
  submissionId: string;
  actorUserId: string;
  /** Free-form rejection reason — shown in the RejectionMail. */
  grund: string;
}

export type RejectSubmissionResult =
  | { ok: true; alreadyDecided: boolean }
  | { ok: false; status: number; error: string };

/**
 * Reject an audit-inbox submission — sets `decision='rejected'`, `decided_at`,
 * `decided_by_user_id`, `decision_reason`. NO expense row is created.
 *
 * Idempotency: a second call on an already-decided submission returns
 * `{ alreadyDecided: true }` without re-emitting any event.
 */
export async function rejectSubmission(
  input: RejectSubmissionInput,
): Promise<RejectSubmissionResult> {
  const { submissionId, actorUserId, grund } = input;
  if (!submissionId) {
    return { ok: false, status: 400, error: "Fehlende Submission-ID" };
  }
  if (!grund || grund.trim().length < 3) {
    return {
      ok: false,
      status: 422,
      error: "Bitte gib eine Begründung an (mind. 3 Zeichen)",
    };
  }

  const db = getDb();

  const subRows = await db
    .select()
    .from(auslagenSubmissions)
    .where(eq(auslagenSubmissions.id, submissionId))
    .limit(1);
  const submission = subRows[0];
  if (!submission) {
    return { ok: false, status: 404, error: "Einreichung nicht gefunden" };
  }

  if (submission.decidedAt && submission.decision) {
    return { ok: true, alreadyDecided: true };
  }

  // A3 (TOCTOU): gate the decision on `decided_at IS NULL` and RETURNING so
  // only ONE of N concurrent calls actually flips the row — that one owns the
  // side-effect emit (audit log + RejectionMail). Other callers see zero rows
  // returned and treat it as alreadyDecided.
  const updated = await db
    .update(auslagenSubmissions)
    .set({
      decidedAt: new Date(),
      decision: "rejected",
      decidedByUserId: actorUserId,
      decisionReason: grund,
      reviewedAt: sql`COALESCE(${auslagenSubmissions.reviewedAt}, now())`,
    })
    .where(
      and(
        eq(auslagenSubmissions.id, submissionId),
        isNull(auslagenSubmissions.decidedAt),
      ),
    )
    .returning({ id: auslagenSubmissions.id });

  if (updated.length === 0) {
    // Lost the race — another concurrent call already decided. No emit.
    return { ok: true, alreadyDecided: true };
  }

  // Resolve recipient email + vorname for the mail.
  let email: string | null = null;
  let vorname = "Mitglied";
  if (submission.bezahltVonKind === "extern") {
    email = submission.externEmail ?? null;
    vorname =
      (submission.externName ?? "").split(" ")[0] ||
      submission.externName ||
      vorname;
  } else if (
    submission.bezahltVonKind === "member" &&
    submission.bezahltVonMemberId
  ) {
    const memberRows = await db
      .select({ email: members.email, vorname: members.vorname })
      .from(members)
      .where(eq(members.id, submission.bezahltVonMemberId))
      .limit(1);
    if (memberRows[0]) {
      email = memberRows[0].email ?? null;
      vorname = memberRows[0].vorname || vorname;
    }
  }

  // A6: do not swallow audit-handler errors. Mail handler is best-effort
  // (its own internal try/catch in handlers.ts); audit handler re-throws.
  await bus.emit("auslage.rejected", {
    submissionId,
    submissionBusinessId: submission.businessId,
    actorUserId,
    email,
    vorname,
    bezeichnung: submission.bezeichnung,
    betragCents: Number(submission.betragCents),
    grund,
  });

  return { ok: true, alreadyDecided: false };
}

// ---------------------------------------------------------------------------
// markExpenseErstattet
// ---------------------------------------------------------------------------

export interface MarkExpenseErstattetInput {
  expenseId: string;
  /** ISO date string (YYYY-MM-DD) — the date the money moved. */
  chosenDate: string;
  zahlungsartId: string;
  actorUserId: string;
  /** Optional Verwendungszweck override (else uses bezeichnung). */
  verwendungszweck?: string;
}

export type MarkExpenseErstattetResult =
  | { ok: true; alreadyErstattet: boolean }
  | { ok: false; status: number; error: string };

/**
 * Mark an expense as reimbursed — sets `erstattet_am = chosenDate`,
 * `zahlungsart_id`, `status='erstattet'`, then emits `expense.erstattet` so
 * the bus handler fires the ErstattungsMail (DB-deduped via sent_mails
 * UNIQUE — second emit is a no-op there too).
 *
 * Idempotency:
 *   - If expense already has `erstattet_am`, return early with
 *     `{ alreadyErstattet: true }`.
 *
 * Festschreibung gate: rejects when the expense's Buchungsjahr (derived
 * from gebucht_am in Berlin TZ) is <= settings.festgeschrieben_bis.
 *
 * Phase 5 ownership: this helper is called from the transaction detail page
 * (Phase 5 builds the UI). Phase 4 wires it from the audit-inbox UI only
 * when the admin re-opens an already-approved expense to pay it.
 */
export async function markExpenseErstattet(
  input: MarkExpenseErstattetInput,
): Promise<MarkExpenseErstattetResult> {
  const { expenseId, chosenDate, zahlungsartId, actorUserId } = input;
  if (!expenseId || !chosenDate || !zahlungsartId) {
    return { ok: false, status: 400, error: "Pflichtfelder fehlen" };
  }
  // Quick ISO YYYY-MM-DD shape check — strictness lives at the route layer.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chosenDate)) {
    return { ok: false, status: 422, error: "Ungültiges Datumsformat" };
  }

  const db = getDb();

  const expRows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1);
  const expense = expRows[0];
  if (!expense) {
    return { ok: false, status: 404, error: "Buchung nicht gefunden" };
  }

  if (!expense.approvedAt) {
    return {
      ok: false,
      status: 409,
      error: "Buchung ist noch nicht freigegeben",
    };
  }

  // Idempotency short-circuit.
  if (expense.erstattetAm) {
    return { ok: true, alreadyErstattet: true };
  }

  // Festschreibung gate — derive Buchungsjahr from gebucht_am (Berlin TZ).
  const buchungsjahr = berlinYear(expense.gebuchtAm);
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null && buchungsjahr <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Jahr ${buchungsjahr} ist festgeschrieben`,
    };
  }

  // A2 (TOCTOU): the SELECT-then-UPDATE pattern is racey — two callers both
  // saw `erstattetAm === null` and both reach this UPDATE. The WHERE clause
  // means only one row is actually changed, but BOTH would emit
  // `expense.erstattet` → duplicate audit_log rows (the sent_mails UNIQUE
  // catches the mail dup but not the audit row). Use RETURNING and the
  // returned row count as the authoritative "I won the race" signal.
  const updatedRows = await db
    .update(expenses)
    .set({
      erstattetAm: chosenDate,
      zahlungsartId,
      status: "erstattet",
      abflussDatum: chosenDate,
      updatedAt: new Date(),
    })
    .where(and(eq(expenses.id, expenseId), isNull(expenses.erstattetAm)))
    .returning({ id: expenses.id });

  if (updatedRows.length === 0) {
    // Lost the race — another concurrent call already marked erstattet.
    return { ok: true, alreadyErstattet: true };
  }

  // Resolve recipient email + vorname for the ErstattungsMail.
  let email: string | null = null;
  let vorname = "Mitglied";
  if (expense.bezahltVonKind === "extern") {
    email = expense.externEmail ?? null;
    vorname =
      (expense.externName ?? "").split(" ")[0] || expense.externName || vorname;
  } else if (
    expense.bezahltVonKind === "member" &&
    expense.bezahltVonMemberId
  ) {
    const memberRows = await db
      .select({ email: members.email, vorname: members.vorname })
      .from(members)
      .where(eq(members.id, expense.bezahltVonMemberId))
      .limit(1);
    if (memberRows[0]) {
      email = memberRows[0].email ?? null;
      vorname = memberRows[0].vorname || vorname;
    }
  }

  // A6: surface audit-handler failures (no swallow). Mail handler in
  // handlers.ts has its own internal best-effort try/catch.
  await bus.emit("expense.erstattet", {
    expenseId,
    expenseBusinessId: expense.businessId,
    actorUserId,
    email,
    vorname,
    bezeichnung: expense.bezeichnung,
    betragCents: Number(expense.betragCents),
    verwendungszweck: input.verwendungszweck ?? expense.bezeichnung,
    erstattungsAm: new Date(`${chosenDate}T00:00:00Z`),
  });

  return { ok: true, alreadyErstattet: false };
}
