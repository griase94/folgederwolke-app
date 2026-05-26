/**
 * Pure cron task helpers — no framework coupling.
 *
 * Each function is independently testable with a mocked DB.  Both cron
 * endpoints (`beitragsreminder` + `daily-dispatcher`) call into this module.
 *
 * All functions return plain result objects; callers decide how to log /
 * surface results.
 */

import { and, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  magicLinks,
  sessions,
  rateLimitAttempts,
} from "$lib/server/db/schema/users.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { sendMail } from "$lib/server/mail/index.js";
import { verifyAuditChain } from "$lib/server/audit-log/verifier.js";
import { berlinYear } from "$lib/domain/year.js";

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Delete expired magic links (older than 1 day past expiry).
 * Returns the number of rows deleted.
 */
export async function cleanupMagicLinks(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(magicLinks)
    .where(lt(magicLinks.expiresAt, sql`now() - INTERVAL '1 day'`))
    .returning({ id: magicLinks.id });
  return deleted.length;
}

/**
 * Delete expired or stale sessions.
 *  - expires_at < now() — hard expiry
 *  - last_used_at < now() - 7 days — inactive for a week
 * Returns the number of rows deleted.
 */
export async function cleanupSessions(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, sql`now()`),
        lt(sessions.lastUsedAt, sql`now() - INTERVAL '7 days'`),
      ),
    )
    .returning({ id: sessions.id });
  return deleted.length;
}

/**
 * Delete rate-limit attempt records older than 1 hour.
 * Returns the number of rows deleted.
 */
export async function cleanupRateLimitAttempts(): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(rateLimitAttempts)
    .where(lt(rateLimitAttempts.occurredAt, sql`now() - INTERVAL '1 hour'`))
    .returning({ id: rateLimitAttempts.id });
  return deleted.length;
}

// ---------------------------------------------------------------------------
// (Phase 11) retryFailedDriveUploads removed — invoice PDFs persist to Vercel
// Blob synchronously inside finalizePdfJob (no separate Drive step to retry).
// Transient failures land on invoices.pdf_status='failed' with the error
// message in pdf_status_error. Phase 12-A removed the "PDF neu generieren"
// action; users re-trigger a render by editing the invoice (which always
// queues a fresh invoice_jobs row + bumps the PDF version), or — for
// festgeschriebene rows — by issuing a Storno via supersede.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Audit-chain nightly verifier (ADR-0004, Phase 7.5)
// ---------------------------------------------------------------------------

export interface AuditVerifyResult {
  ok: boolean;
  rowsChecked: number;
  preGenesisSkipped: number;
  breakCount: number;
  /** First few breaks for the dispatcher response payload; full list in logs. */
  breaksPreview: Array<{
    chainSeq: number;
    rowId: string;
    kind: string;
  }>;
  head: number | null;
}

/**
 * Run the audit-log chain verifier. Returns a flat result the dispatcher
 * can log/persist. Never throws on chain breaks — they are reported in the
 * response so the caller can decide whether to alert.
 */
export async function runAuditChainVerification(): Promise<AuditVerifyResult> {
  const result = await verifyAuditChain();
  if (!result.ok) {
    // Surface in serverless logs immediately. Off-Postgres anchoring is the
    // ultimate guarantee; this is a fast-path detector.
    console.error("[cron/audit-verify] CHAIN BREAKS DETECTED", {
      rowsChecked: result.rowsChecked,
      breakCount: result.breaks.length,
      breaks: result.breaks.slice(0, 10),
    });
  }
  return {
    ok: result.ok,
    rowsChecked: result.rowsChecked,
    preGenesisSkipped: result.preGenesisSkipped,
    breakCount: result.breaks.length,
    breaksPreview: result.breaks.slice(0, 5).map((b) => ({
      chainSeq: b.chainSeq,
      rowId: b.rowId,
      kind: b.kind,
    })),
    head: result.head,
  };
}

// ---------------------------------------------------------------------------
// Beitragsreminder dispatch
// ---------------------------------------------------------------------------

export interface BeitragsreminderResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Find members with open Beiträge for the current calendar year and send a
 * BeitragsReminder mail to each. Dedup is handled by the sent_mails UNIQUE
 * constraint — members who already received a reminder this year (same
 * entity_id + send_attempt=1) are silently skipped.
 *
 * "Open" means paid_cents < betrag_cents and the member has an email address.
 */
export async function dispatchBeitragsreminder(opts: {
  iban: string;
  bic: string;
  bank: string;
  empfaenger: string;
  year?: number;
}): Promise<BeitragsreminderResult> {
  const db = getDb();
  // Use year_for_booking(now()) — same function as the DB stored column —
  // to ensure Berlin-timezone consistency (ADR-0001).
  let currentYear: number;
  if (opts.year !== undefined) {
    currentYear = opts.year;
  } else {
    const rows = await db.execute<{ yr: number }>(
      sql`SELECT year_for_booking(now()) AS yr`,
    );
    // ADR-0001: fallback to Berlin-local year if the SQL year_for_booking
    // call returned no row (shouldn't happen, but defensive).
    currentYear = rows[0]?.yr ?? berlinYear();
  }

  // Members with open Beitrag for current year who have an email address.
  const openRows = await db
    .select({
      memberId: memberBeitrags.memberId,
      year: memberBeitrags.year,
      betragCents: memberBeitrags.betragCents,
      paidCents: memberBeitrags.paidCents,
      vorname: members.vorname,
      nachname: members.nachname,
      email: members.email,
    })
    .from(memberBeitrags)
    .innerJoin(members, eq(memberBeitrags.memberId, members.id))
    .where(
      and(
        eq(memberBeitrags.year, currentYear),
        sql`${memberBeitrags.paidCents} < ${memberBeitrags.betragCents}`,
        sql`${members.email} IS NOT NULL`,
        // Exclude Ehrenmitglieder / exempt members — they may have synthetic
        // unpaid rows but must never receive "Sie schulden €X" reminders.
        eq(members.beitragExempt, false),
        // Only active members (no Austrittsdatum or Austrittsdatum in future)
        or(
          sql`${members.austrittsDatum} IS NULL`,
          sql`${members.austrittsDatum} > current_date`,
        ),
      ),
    );

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of openRows) {
    if (!row.email) {
      skipped++;
      continue;
    }
    try {
      // B7 fix (ADR-0005): use year-based send_attempt so 2026 reminder is not
      // deduped against the 2025 reminder. Formula: year - 2020 is monotonic
      // (2025→5, 2026→6, …) and unique per year for the same (template, entity).
      const sendAttempt = currentYear - 2020;
      const result = await sendMail({
        template: "beitrag_reminder",
        entity_kind: "member",
        entity_id: row.memberId,
        to: row.email,
        send_attempt: sendAttempt,
        props: {
          vorname: row.vorname,
          nachname: row.nachname,
          jahr: currentYear,
          betragCents: Number(row.betragCents),
          iban: opts.iban,
          bic: opts.bic,
          bank: opts.bank,
          empfaenger: opts.empfaenger,
        },
      });
      if (result.deduped) {
        skipped++;
      } else {
        sent++;
      }
    } catch (err) {
      console.error(
        `[cron/beitragsreminder] Failed to send reminder to member ${row.memberId}:`,
        err,
      );
      errors++;
    }
  }

  return { checked: openRows.length, sent, skipped, errors };
}
