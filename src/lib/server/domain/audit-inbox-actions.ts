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
import { sentMails } from "$lib/server/db/schema/mails.js";
import { bus } from "$lib/server/events/index.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { resolveKategorieByName } from "$lib/server/domain/transactions.js";
import {
  composeBezahltVonDisplay,
  type BezahltVon,
} from "$lib/server/domain/auslagen.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";
import { berlinYear, bookingYearFromCashDate } from "$lib/domain/year.js";

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
  /**
   * UUID of the normalized `files` row when the admin uploads a Beleg via
   * handleAuslageUpload (ARM A of THE BELEG RULE). Mutually exclusive with
   * belegVerzichtGrund — exactly one arm must be set (enforced by the DB
   * CHECK `auslagen_submissions_beleg_or_grund_ck`, migration 0036).
   */
  belegFileId?: string | null;
  /**
   * ARM B of THE BELEG RULE: the admin's documented reason for having no Beleg
   * (min 5 trimmed chars). Persisted when keinBeleg is toggled with a valid
   * Begründung. Mutually exclusive with belegFileId.
   */
  belegVerzichtGrund?: string | null;
  /** UUID of the admin user performing the import (for audit log). */
  actorUserId: string;
  /**
   * Optional client idempotency nonce (UUID). Admin manual imports normally
   * carry NONE (null) — the admin is the human dedup. Persisted when present
   * so the partial UNIQUE index (migration 0033) still guards against a
   * double-submit if a future caller does supply one. NULL never collides
   * (partial index is `WHERE submission_nonce IS NOT NULL`).
   */
  submissionNonce?: string | null;
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
      submissionNonce: input.submissionNonce ?? null,
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
      belegFileId: input.belegFileId ?? null,
      belegVerzichtGrund: input.belegVerzichtGrund ?? null,
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
 * Compute the Buchungsjahr used for the Festschreibung gate at approval time.
 *
 * Migration 0034 derives an expense's `year_of_buchung` from the CASH date:
 *   COALESCE(extract(year FROM abfluss_datum)::int, year_for_booking(gebucht_am)).
 * At approval the new `expenses` row is inserted with `abfluss_datum = NULL`
 * (reimbursement hasn't happened yet) and `gebucht_am DEFAULT now()`, so it
 * lands in `year_for_booking(now())` — the CURRENT Berlin Buchungsjahr.
 *
 * Therefore the gate must guard the LANDING year (current Berlin year), NOT the
 * submission's `rechnungsdatum`. The receipt date is irrelevant to where the
 * EÜR cash booking lands; gating on it would (a) wrongly block approving a
 * prior-year receipt in an open current year, and (b) disagree with the DB
 * festschreibung trigger, which also computes from the (null) abfluss → now().
 * ADR-0001 + ADR-0006 + migration 0034.
 */
function buchungsjahrForSubmission(): number {
  return berlinYear();
}

// ---------------------------------------------------------------------------
// approveSubmission
// ---------------------------------------------------------------------------

export interface ApproveSubmissionInput {
  submissionId: string;
  actorUserId: string;
  /** Spec §4.6: the treasurer-chosen expense Kategorie NAME-snapshot (required). */
  kategorieName: string;
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
  const { submissionId, actorUserId, kategorieName } = input;
  if (!submissionId) {
    return { ok: false, status: 400, error: "Fehlende Submission-ID" };
  }
  const chosenKategorieName = kategorieName?.trim();
  if (!chosenKategorieName) {
    return { ok: false, status: 400, error: "Bitte eine Kategorie wählen" };
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
  // Gate on the year the approved expense will LAND in (cash-derived). With
  // abfluss NULL at approve, that's the current Berlin year — not the
  // submission's rechnungsdatum. See buchungsjahrForSubmission() above.
  const buchungsjahr = buchungsjahrForSubmission();
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

  // Spec §4.6/§4.5: resolve the chosen Kategorie by NAME (authoritative) and
  // derive sphere strictly from it — never a project default, never hardcoded.
  // resolveKategorieByName THROWS on a miss; catch it so a renamed/stale
  // Kategorie yields a clean 400 (surfaced as a toast), never a 500. Resolved
  // outside the tx — the picked name is validated up-front, not per-row.
  let kat: Awaited<ReturnType<typeof resolveKategorieByName>>;
  try {
    kat = await resolveKategorieByName("expense", chosenKategorieName);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Kategorie not found:")
    ) {
      return {
        ok: false,
        status: 400,
        error: "Kategorie nicht gefunden — bitte neu wählen",
      };
    }
    throw err;
  }

  type ApproveTxResult =
    | { kind: "created"; id: string; businessId: string }
    | { kind: "existed"; id: string; businessId: string };

  let result: ApproveTxResult;
  try {
    result = await db.transaction(async (tx): Promise<ApproveTxResult> => {
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
            // Spec §4.6/§4.5: stamp the treasurer-chosen Kategorie + derive
            // sphere strictly from it (gate is live — no more Import sentinel,
            // no more hardcoded "ideeller").
            kategorieId: kat.id,
            kategorieNameSnapshot: kat.name,
            sphereSnapshot: kat.sphere,
            // ADR-0007: copy discriminator + extern fields verbatim.
            bezahltVonKind: bezahltVonKind,
            bezahltVonMemberId: submission.bezahltVonMemberId,
            externName: submission.externName,
            externIban: submission.externIban,
            externEmail: submission.externEmail,
            bezahltVonDisplay: submission.bezahltVonDisplay,
            belegFileId: submission.belegFileId,
            belegDriveFileId: submission.belegDriveFileId,
            belegOriginalName: submission.belegOriginalName,
            belegVerzichtGrund: submission.belegVerzichtGrund ?? null,
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
            .select({
              approvedExpenseId: auslagenSubmissions.approvedExpenseId,
            })
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
        // Postgres check-violation (SQLSTATE 23514): a NULL/NULL row slipped
        // through the app gate (e.g. a pre-constraint legacy row being approved).
        // Map to 409 so the caller surfaces a clean error, not a 500.
        if (isCheckViolation(insertErr)) {
          throw Object.assign(
            new Error(
              "Beleg fehlt — bitte Beleg anhängen oder Verzicht begründen",
            ),
            { _checkViolation: true },
          );
        }
        throw insertErr;
      }
    });
  } catch (txErr) {
    if (
      txErr instanceof Error &&
      "_checkViolation" in txErr &&
      (txErr as { _checkViolation?: boolean })._checkViolation
    ) {
      return {
        ok: false,
        status: 409,
        error: "Beleg fehlt — bitte Beleg anhängen oder Verzicht begründen",
      };
    }
    throw txErr;
  }

  // ── 4. Emit events (audit log written by handler) ────────────────────────
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

    // ── 4a. auslage.approved → ApprovalMail (C7-INBOX, ADR-0005) ──────────
    // Resolve recipient email + vorname for the mail, same pattern as
    // rejectSubmission. Then compute send_attempt (P2-B6): count existing
    // auslage_approved rows so re-approve-after-reject increments naturally.
    let submitterEmail: string | null = null;
    let submitterVorname: string | null = null;
    if (submission.bezahltVonKind === "extern") {
      submitterEmail = submission.externEmail ?? null;
      submitterVorname =
        (submission.externName ?? "").split(" ")[0] ||
        submission.externName ||
        null;
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
        submitterEmail = memberRows[0].email ?? null;
        submitterVorname = memberRows[0].vorname ?? null;
      }
    }

    // P2-B6: count existing auslage_approved rows for this submission to
    // determine send_attempt. First approval → 0. Re-approve-after-reject
    // cycle → 1, 2, … so the ADR-0005 UNIQUE allows a new row.
    const countRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sentMails)
      .where(
        and(
          eq(sentMails.template, "auslage_approved"),
          eq(sentMails.entityKind, "auslagen_submission"),
          eq(sentMails.entityId, submissionId),
        ),
      );
    const sendAttempt = Number(countRows[0]?.n ?? 0);

    await bus.emit("auslage.approved", {
      submissionId,
      submissionBusinessId: submission.businessId,
      submitterEmail,
      vorname: submitterVorname,
      bezeichnung: submission.bezeichnung,
      betragCents: Number(submission.betragCents),
      // Spec §4.6: the ApprovalMail carries the treasurer-chosen Kategorie
      // (same value stamped on the expense INSERT above, kept CONSISTENT).
      kategorie: kat.name,
      decidedAt: new Date().toISOString(),
      decidedByUserId: actorUserId,
      send_attempt: sendAttempt,
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
  return hasPgCode(err, "23505");
}

/**
 * True if `err` is a Postgres check-violation (SQLSTATE 23514). The
 * festschreibung trigger (`assert_not_festgeschrieben_fn`, migration 0014)
 * raises with `USING ERRCODE = 'check_violation'` (= 23514) and NO constraint
 * name — so we discriminate on the SQLSTATE alone, walking the driver/drizzle
 * cause chain the same way as isUniqueViolation.
 */
function isCheckViolation(err: unknown): boolean {
  return hasPgCode(err, "23514");
}

/**
 * Walk the error cause-chain (postgres-js → `err.code`, drizzle wraps with
 * `cause`) looking for the given SQLSTATE. Shared by the unique/check helpers.
 */
function hasPgCode(err: unknown, sqlstate: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur) {
      const code = (cur as { code?: unknown }).code;
      if (code === sqlstate) return true;
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

  // Festschreibung gate (ADR-0006) — mirror markExpenseAsPaid (transactions.ts)
  // exactly so both reimburse paths agree on Buchungsjahr AND on which year the
  // gate guards. The UPDATE below preserves an existing abfluss_datum with
  // COALESCE (it never rebuckets a row already carrying a cash-out date), so the
  // EFFECTIVE abfluss after the write is `abflussDatum ?? chosenDate`. Gate on
  // bookingYearFromCashDate(effectiveAbfluss, gebuchtAm) so the app rejection
  // equals the LEAST(OLD.year_of_buchung, year_for_booking(gebucht_am)) the DB
  // trigger guards on UPDATE — without this an expense whose existing abfluss
  // sits in a closed year could slip past year(chosenDate)=open and then hit a
  // raw 23514 from the trigger (migration 0014/0034).
  const effectiveAbfluss = expense.abflussDatum ?? chosenDate;
  const buchungsjahr = bookingYearFromCashDate(
    effectiveAbfluss,
    expense.gebuchtAm,
  );
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
  //
  // `abfluss_datum` is preserved with COALESCE (mirrors markExpenseAsPaid): a
  // member/extern row already carries its own cash-out date and keeps it; only
  // a row that never had one (Verein-direct, the reimbursement IS the cash-out)
  // takes `chosenDate`. This is the single canonical reimburse semantics shared
  // by both entry points (transactions.ts markExpenseAsPaid + this helper).
  let updatedRows: { id: string }[];
  try {
    updatedRows = await db
      .update(expenses)
      .set({
        erstattetAm: chosenDate,
        zahlungsartId,
        status: "erstattet",
        abflussDatum: sql`COALESCE(abfluss_datum, ${chosenDate}::date)`,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, expenseId), isNull(expenses.erstattetAm)))
      .returning({ id: expenses.id });
  } catch (err) {
    // The DB festschreibung trigger raises SQLSTATE 23514 (check_violation) if
    // the row's Buchungsjahr is festgeschrieben. The app gate above should
    // already have blocked this, but a stray trigger rejection must degrade to
    // a clean per-row {ok:false,status:409} so a single mismatched row does NOT
    // 500 the whole `?/bulk-mark-erstattet` batch (the loop's 409→'festgeschrieben'
    // mapping then runs instead of an unhandled throw).
    if (isCheckViolation(err)) {
      return {
        ok: false,
        status: 409,
        error: `Buchung ist festgeschrieben — Erstattung verweigert`,
      };
    }
    throw err;
  }

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
