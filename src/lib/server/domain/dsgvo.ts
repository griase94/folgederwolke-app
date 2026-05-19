/**
 * DSGVO domain helpers — Auskunft collection + Pseudonymisierung.
 *
 * §147 AO 10-year retention: member_beitrags, donations, expenses, invoices,
 * income rows must NOT be hard-deleted. PII fields are replaced with redacted
 * placeholders. Auth rows (users, sessions, magic_links) are hard-deleted.
 *
 * Both operations are read-model safe — callers supply a db/tx handle.
 */

import { eq, or, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { users, sessions, magicLinks } from "$lib/server/db/schema/users.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { logAudit } from "$lib/server/audit-log/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuskunftData {
  email: string;
  collectedAt: string;
  members: unknown[];
  donations: unknown[];
  auslagenSubmissions: unknown[];
  sentMails: unknown[];
  auditLogEntries: unknown[];
}

export interface PseudonymiseResult {
  membersPseudonymised: number;
  usersDeleted: number;
  sessionsDeleted: number;
  magicLinksDeleted: number;
  donationsRedacted: number;
  sentMailsRedacted: number;
  auditLogPayloadsRedacted: number;
}

// ─── collectAuskunft ──────────────────────────────────────────────────────────

/**
 * Collect all data referencing the given email across all tables.
 * Returns structured JSON suitable for PDF rendering (auskunft.ts).
 */
export async function collectAuskunft(email: string): Promise<AuskunftData> {
  const db = getDb();
  const emailLower = email.toLowerCase().trim();

  // Members by email (exact match on both raw + canonical)
  const memberRows = await db
    .select()
    .from(members)
    .where(
      or(
        eq(sql`lower(${members.email})`, emailLower),
        eq(sql`lower(${members.emailCanonical})`, emailLower),
      ),
    );

  // Donations by spender_email OR by member_id of found members
  const memberIds = memberRows.map((m) => m.id);
  const donationRows: (typeof donations.$inferSelect)[] =
    memberIds.length > 0
      ? await db
          .select()
          .from(donations)
          .where(
            or(
              ...memberIds.map((id) => eq(donations.memberId, id)),
              eq(sql`lower(${donations.spenderEmail})`, emailLower),
            ),
          )
      : await db
          .select()
          .from(donations)
          .where(eq(sql`lower(${donations.spenderEmail})`, emailLower));

  // Auslagen submissions — by extern_email or by member_id
  const auslagenRows: (typeof auslagenSubmissions.$inferSelect)[] =
    memberIds.length > 0
      ? await db
          .select()
          .from(auslagenSubmissions)
          .where(
            or(
              ...memberIds.map((id) =>
                eq(auslagenSubmissions.bezahltVonMemberId, id),
              ),
              eq(sql`lower(${auslagenSubmissions.externEmail})`, emailLower),
            ),
          )
      : await db
          .select()
          .from(auslagenSubmissions)
          .where(
            eq(sql`lower(${auslagenSubmissions.externEmail})`, emailLower),
          );

  // Sent mails — by to_canonical
  const sentMailRows = await db
    .select()
    .from(sentMails)
    .where(eq(sql`lower(${sentMails.toCanonical})`, emailLower));

  // Audit log — payload jsonb may contain email or member_id references
  // We search payload for the email string (GIN-style cast to text for portability)
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(sql`${auditLog.payload}::text ilike ${"%" + emailLower + "%"}`);

  return {
    email,
    collectedAt: new Date().toISOString(),
    members: memberRows.map((r) => ({
      id: r.id,
      vorname: r.vorname,
      nachname: r.nachname,
      email: r.email,
      emailCanonical: r.emailCanonical,
      iban: r.iban,
      telefon: r.telefon,
      adresse: r.adresse,
      dateOfBirth: r.dateOfBirth,
      role: r.role,
      eintrittsDatum: r.eintrittsDatum,
      austrittsDatum: r.austrittsDatum,
      createdAt: r.createdAt?.toISOString(),
    })),
    donations: donationRows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      gebuchtAm: r.gebuchtAm?.toISOString(),
      betragCents: Number(r.betragCents),
      memberId: r.memberId,
      spenderName: r.spenderName,
      spenderAdresse: r.spenderAdresse,
      spenderEmail: r.spenderEmail,
      spendeKind: r.spendeKind,
      bescheinigungNr: r.bescheinigungNr,
    })),
    auslagenSubmissions: auslagenRows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      submittedAt: r.submittedAt?.toISOString(),
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      bezahltVonKind: r.bezahltVonKind,
      bezahltVonMemberId: r.bezahltVonMemberId,
      externName: r.externName,
      externEmail: r.externEmail,
    })),
    sentMails: sentMailRows.map((r) => ({
      id: r.id,
      template: r.template,
      toCanonical: r.toCanonical,
      toDisplay: r.toDisplay,
      subject: r.subject,
      status: r.status,
      queuedAt: r.queuedAt?.toISOString(),
    })),
    auditLogEntries: auditRows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt?.toISOString(),
      action: r.action,
      entityKind: r.entityKind,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      payloadSummary: "[audit payload — see full export]",
    })),
  };
}

// ─── pseudonymise ─────────────────────────────────────────────────────────────

/**
 * Pseudonymise all PII for the given email address.
 *
 * Runs in a single transaction. Idempotent — calling twice is safe:
 * the member row will already have the deleted-* email, so the user/session
 * DELETE will find nothing on the second call, and redactions are no-op.
 *
 * §147 AO 10-year retention:
 *   - member_beitrags: preserved (tax-relevant)
 *   - donations: spender PII redacted, amounts/dates kept
 *   - sent_mails: recipient redacted, row kept (idempotency)
 *   - audit_log: payload email/name fields redacted
 *
 * Hard-deleted:
 *   - users row (auth account)
 *   - sessions (all for user)
 *   - magic_links (by email_canonical)
 */
export async function pseudonymise(
  email: string,
  actorUserId: string | null,
): Promise<PseudonymiseResult> {
  const db = getDb();
  const emailLower = email.toLowerCase().trim();

  const result = await db.transaction(async (tx) => {
    const res: PseudonymiseResult = {
      membersPseudonymised: 0,
      usersDeleted: 0,
      sessionsDeleted: 0,
      magicLinksDeleted: 0,
      donationsRedacted: 0,
      sentMailsRedacted: 0,
      auditLogPayloadsRedacted: 0,
    };

    // ── 1. Find member rows ────────────────────────────────────────────────
    const memberRows = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        or(
          eq(sql`lower(${members.email})`, emailLower),
          eq(sql`lower(${members.emailCanonical})`, emailLower),
        ),
      );

    for (const member of memberRows) {
      // Short ID suffix for the deleted-* placeholder email
      const idShort = member.id.replace(/-/g, "").slice(0, 12);

      await tx
        .update(members)
        .set({
          vorname: "****",
          nachname: "****",
          email: `deleted-${idShort}@example.invalid`,
          emailCanonical: `deleted-${idShort}@example.invalid`,
          telefon: null,
          adresse: null,
          dateOfBirth: null,
          iban: null,
          updatedAt: new Date(),
        })
        .where(eq(members.id, member.id));

      res.membersPseudonymised++;
    }

    // ── 2. Delete auth rows ────────────────────────────────────────────────
    // Find user by email (before it gets changed — we query users table directly)
    const userRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(sql`lower(${users.email})`, emailLower),
          eq(sql`lower(${users.emailCanonical})`, emailLower),
        ),
      );

    for (const user of userRows) {
      // Sessions cascade via FK, but we delete explicitly for audit clarity
      const deletedSessions = await tx
        .delete(sessions)
        .where(eq(sessions.userId, user.id))
        .returning({ id: sessions.id });
      res.sessionsDeleted += deletedSessions.length;

      await tx.delete(users).where(eq(users.id, user.id));
      res.usersDeleted++;
    }

    // Magic links by email_canonical
    const deletedLinks = await tx
      .delete(magicLinks)
      .where(eq(sql`lower(${magicLinks.emailCanonical})`, emailLower))
      .returning({ id: magicLinks.id });
    res.magicLinksDeleted = deletedLinks.length;

    // ── 3. Redact donations (§147 AO — keep record, strip spender PII) ────
    const redactedDonations = await tx
      .update(donations)
      .set({
        spenderName: null,
        spenderAdresse: null,
        spenderEmail: null,
        updatedAt: new Date(),
      })
      .where(eq(sql`lower(${donations.spenderEmail})`, emailLower))
      .returning({ id: donations.id });
    res.donationsRedacted = redactedDonations.length;

    // ── 4. Redact sent_mails recipient ─────────────────────────────────────
    const redactedMails = await tx
      .update(sentMails)
      .set({
        toCanonical: "deleted@example.invalid",
        toDisplay: "****",
      })
      .where(eq(sql`lower(${sentMails.toCanonical})`, emailLower))
      .returning({ id: sentMails.id });
    res.sentMailsRedacted = redactedMails.length;

    // ── 5. Redact audit_log payload email/name fields ─────────────────────
    // We use jsonb operations to remove/replace PII keys from payload.
    // The audit_log is append-only per ADR-0004; Phase 7.5 REVOKE will
    // prevent UPDATE from app_runtime — until then this UPDATE is permitted.
    const redactedAudit = await tx
      .update(auditLog)
      .set({
        payload: sql`
          (COALESCE(${auditLog.payload}, '{}'::jsonb)
            - 'email'
            - 'vorname'
            - 'nachname'
            - 'iban'
            - 'adresse'
            - 'telefon'
          ) || '{"_pseudonymised": true}'::jsonb
        `,
      })
      .where(sql`${auditLog.payload}::text ilike ${"%" + emailLower + "%"}`)
      .returning({ id: auditLog.id });
    res.auditLogPayloadsRedacted = redactedAudit.length;

    // ── 6. Audit this pseudonymise operation itself ────────────────────────
    await logAudit(
      {
        action: "delete",
        entityKind: "member",
        entityId: memberRows[0]?.id ?? null,
        actorUserId,
        actorKind: "user",
        payload: {
          operation: "pseudonymise",
          targetEmail: email,
          membersPseudonymised: res.membersPseudonymised,
          usersDeleted: res.usersDeleted,
          sessionsDeleted: res.sessionsDeleted,
          magicLinksDeleted: res.magicLinksDeleted,
          donationsRedacted: res.donationsRedacted,
          sentMailsRedacted: res.sentMailsRedacted,
          auditLogPayloadsRedacted: res.auditLogPayloadsRedacted,
        },
      },
      tx,
    );

    return res;
  });

  return result;
}
