/**
 * /app/mitglieder/[id] — Member detail page.
 *
 * load()   → fetch member by id (404 if not found), all beitrags, activity feed,
 *             dedup-check for reminder mail (sent in last 30 days).
 * actions:
 *   ?/edit                — edit master data (shared with the list route)
 *   ?/delete              — soft-delete (sets austritts_datum = today)
 *   ?/mark-beitrag-paid   — mark a member's beitrag year as fully paid
 *   ?/send-reminder-bulk  — BeitragsReminder via the consolidated Bulk sheet (n=1)
 *
 * Edit/delete/mark-paid logic lives in `$lib/server/domain/members-actions.ts`
 * so the same write paths run regardless of which route the form posts to.
 */

import { error, fail } from "@sveltejs/kit";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { users } from "$lib/server/db/schema/users.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import {
  editMember,
  softDeleteMember,
  markBeitragPaid,
  sendBeitragReminderBulk,
} from "$lib/server/domain/members-actions.js";
import { loadReminderCandidates } from "$lib/server/domain/reminder-candidates.js";
import { vereinBankIdentity } from "$lib/server/domain/beitrag-reminder.js";
import { env } from "$lib/server/env.js";
import {
  berlinYear,
  berlinYmd,
  currentBuchungsjahr,
} from "$lib/domain/year.js";
import { assertUuidOr404 } from "$lib/domain/uuid.js";

export const load: PageServerLoad = async ({ params }) => {
  // F14: validate the uuid param first → clean 404 instead of a 22P02 500.
  const id = assertUuidOr404(params.id, "Mitglied nicht gefunden");
  const db = getDb();

  // ── Fetch member ──────────────────────────────────────────────────────────
  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.id, id))
    .limit(1);

  if (memberRows.length === 0 || !memberRows[0]) {
    error(404, "Mitglied nicht gefunden");
  }

  const member = memberRows[0];

  // ── Fetch all beitrags (all years, not just the 3-year window) ───────────
  const beitragRows = await db
    .select()
    .from(memberBeitrags)
    .where(eq(memberBeitrags.memberId, id))
    .orderBy(desc(memberBeitrags.year));

  // ── Fetch activity: audit_log entries for this member ────────────────────
  // S4 #7: LEFT JOIN users for the actor name — COALESCE(u.name, u.email,
  // 'System'). users.name is nullable today (real-name fill is the G-Lane
  // mini-profil screen, Wave 4); the COALESCE falls back to the login e-mail so
  // a later name-fill "shines through" without any change here.
  const auditRows = await db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      actorKind: auditLog.actorKind,
      payload: auditLog.payload,
      actorName: sql<string>`COALESCE(${users.name}, ${users.email}, 'System')`,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.entityKind, "member"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.occurredAt))
    .limit(50);

  // ── Fetch activity: sent_mails for this member ───────────────────────────
  const mailRows = await db
    .select()
    .from(sentMails)
    .where(and(eq(sentMails.entityKind, "member"), eq(sentMails.entityId, id)))
    .orderBy(desc(sentMails.queuedAt))
    .limit(50);

  // ── Compute current year for hero + reminder defaults (ADR-0001) ─────────
  const currentYear = berlinYear();

  // ── Bulk-Reminder candidate for THIS member (n=1) ─────────────────────────
  // Reuse the single source (loadReminderCandidates) so the detail sheet matches
  // the list exactly — same state resolution, 30-day dedup, and false-debt gate.
  // Empty when the member owes nothing for the current Buchungsjahr.
  const reminderYear = currentBuchungsjahr();
  const reminderData = await loadReminderCandidates(reminderYear);
  const reminderCandidates = reminderData.candidates.filter(
    (c) => c.memberId === id,
  );
  const reminderIban = vereinBankIdentity()?.iban ?? null;

  // ── Org constants for mail preview ───────────────────────────────────────
  const mailFrom = env.MAIL_FROM;

  // ── Package B: satzByYear — load Satz for all years member has a row in
  //    plus the current year (so UI can show betragCents for no-row years) ─
  const beitragYears = [
    ...new Set([...beitragRows.map((b) => b.year), currentYear]),
  ];
  let satzRows: { year: number; cents: bigint }[] = [];
  if (beitragYears.length > 0) {
    satzRows = await db
      .select({
        year: beitragssatzByYear.year,
        cents: beitragssatzByYear.cents,
      })
      .from(beitragssatzByYear)
      .where(inArray(beitragssatzByYear.year, beitragYears));
  }
  const satzByYear: Record<number, number> = {};
  for (const s of satzRows) satzByYear[s.year] = Number(s.cents);

  const currentYearBeitrag = beitragRows.find((b) => b.year === currentYear);

  return {
    member: {
      id: member.id,
      vorname: member.vorname,
      nachname: member.nachname,
      email: member.email,
      iban: member.iban,
      telefon: member.telefon,
      adresse: member.adresse,
      dateOfBirth: member.dateOfBirth,
      role: member.role,
      eintrittsDatum: member.eintrittsDatum,
      austrittsDatum: member.austrittsDatum,
      // Night-2 C5-MEM-full: surface exempt-flag + reason to the detail page.
      beitragExempt: member.beitragExempt,
      beitragExemptReason: member.beitragExemptReason,
      isFixture: member.isFixture,
      createdAt: member.createdAt.toISOString(),
    },
    beitrags: beitragRows.map((b) => ({
      id: b.id,
      year: b.year,
      betragCents: Number(b.betragCents),
      paidCents: Number(b.paidCents),
      gezahltAm: b.gezahltAm,
      notes: b.notes,
      isExempt: b.isExempt ?? false,
      exemptReason: b.exemptReason ?? null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    activity: {
      auditEntries: auditRows.map((a) => ({
        id: a.id,
        occurredAt: a.occurredAt.toISOString(),
        action: a.action,
        actorKind: a.actorKind,
        actorName: a.actorName,
        payload: a.payload as Record<string, unknown> | null,
      })),
      sentMails: mailRows.map((m) => ({
        id: m.id,
        template: m.template,
        subject: m.subject,
        status: m.status,
        queuedAt: m.queuedAt.toISOString(),
        sentAt: m.sentAt?.toISOString() ?? null,
      })),
    },
    reminderYear,
    reminderCandidates,
    reminderIban,
    mailFrom,
    currentYear,
    satzByYear,
    currentYearBeitrag: currentYearBeitrag
      ? {
          id: currentYearBeitrag.id,
          betragCents: Number(currentYearBeitrag.betragCents),
          paidCents: Number(currentYearBeitrag.paidCents),
          isExempt: currentYearBeitrag.isExempt ?? false,
        }
      : null,
  };
};

export const actions: Actions = {
  // ── Edit member ─────────────────────────────────────────────────────────────
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    // Fall back to the route param when the form omits the id.
    if (!raw.id && params.id) raw.id = params.id;

    const result = await editMember(raw, userId, userRole);
    if (!result.ok) {
      return fail(result.status, {
        action: "edit",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "edit", success: true };
  },

  // ── Soft-delete member ──────────────────────────────────────────────────────
  delete: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() || params.id || "";
    // F14: validate the resolved id BEFORE the ::uuid cast (actions skip load()).
    assertUuidOr404(id, "Mitglied nicht gefunden");

    const result = await softDeleteMember(id, userId, userRole);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Mark Beitrag paid ─────────────────────────────────────────────────────
  // Package B: accepts optional paidCents (partial) + notes fields.
  "mark-beitrag-paid": async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    // F14: validate before memberId reaches the ::uuid cast in markBeitragPaid.
    const memberId = assertUuidOr404(params.id, "Mitglied nicht gefunden");
    const formData = await request.formData();
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    // Accept "gezahltAm" (new popover) or "gezahlt_am" (legacy) field names
    const gezahltAm =
      formData.get("gezahltAm")?.toString() ||
      formData.get("gezahlt_am")?.toString() ||
      berlinYmd();

    // Package B: optional partial paidCents (integer cents) and notes
    const paidCentsStr = formData.get("paidCents")?.toString();
    const paidCents = paidCentsStr ? parseInt(paidCentsStr, 10) : undefined;
    const notes = formData.get("notes")?.toString() ?? null;

    const result = await markBeitragPaid({
      memberId,
      year,
      gezahltAm,
      paidCents:
        paidCents !== undefined && Number.isFinite(paidCents)
          ? paidCents
          : undefined,
      notes,
      actorUserId: userId,
      actorRole: userRole,
    });
    if (!result.ok) {
      return fail(result.status, {
        action: "mark-beitrag-paid",
        error: result.error,
      });
    }

    return { action: "mark-beitrag-paid", success: true };
  },

  // ── Send BeitragsReminder (Bulk endpoint; the detail bar posts n=1) ────────
  // Consolidated on the same path as the list (Ruling C6a): the SendReminder
  // BulkSheet on the detail page posts one selected recipient here. The
  // false-debt guard + (member, year) dedup + event-bus dispatch live in
  // sendBeitragReminderBulk.
  "send-reminder-bulk": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const memberIds = formData
      .getAll("memberId")
      .map((v) => v.toString())
      .filter(Boolean);
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);
    const fristAt = formData.get("fristAt")?.toString() || null;
    const customIntro = formData.get("customIntro")?.toString() || null;

    const result = await sendBeitragReminderBulk({
      memberIds,
      year,
      fristAt,
      customIntro,
      actorUserId: userId,
      actorRole: userRole,
    });
    if (!result.ok) {
      return fail(result.status, {
        action: "send-reminder-bulk",
        error: result.error,
      });
    }

    return {
      action: "send-reminder-bulk",
      success: true,
      sent: result.sent,
      skippedNoMail: result.skippedNoMail,
      skippedDeduped: result.skippedDeduped,
      skippedNoDebt: result.skippedNoDebt,
      failed: result.failed,
    };
  },
};
