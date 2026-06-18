/**
 * /app/mitglieder/[id] — Member detail page.
 *
 * load()   → fetch member by id (404 if not found), all beitrags, activity feed,
 *             dedup-check for reminder mail (sent in last 30 days).
 * actions:
 *   ?/edit              — edit master data (shared with the list route)
 *   ?/delete            — soft-delete (sets austritts_datum = today)
 *   ?/mark-beitrag-paid — mark a member's beitrag year as fully paid
 *   ?/send-reminder     — send a BeitragsReminder mail (respects 30-day dedup)
 *
 * Edit/delete/mark-paid logic lives in `$lib/server/domain/members-actions.ts`
 * so the same write paths run regardless of which route the form posts to.
 */

import { error, fail } from "@sveltejs/kit";
import { and, eq, gt, count, desc, inArray } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import {
  editMember,
  softDeleteMember,
  markBeitragPaid,
  checkReminderAllowed,
} from "$lib/server/domain/members-actions.js";
import { sendMail } from "$lib/server/mail/index.js";
import { env } from "$lib/server/env.js";
import { berlinYear, berlinYmd } from "$lib/domain/year.js";

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
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
  const auditRows = await db
    .select()
    .from(auditLog)
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

  // ── 30-day reminder dedup check ──────────────────────────────────────────
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentReminderRows = await db
    .select({ cnt: count() })
    .from(sentMails)
    .where(
      and(
        eq(sentMails.template, "beitrag_reminder"),
        eq(sentMails.entityKind, "member"),
        eq(sentMails.entityId, id),
        gt(sentMails.queuedAt, cutoff),
      ),
    );

  const reminderSentRecently = (recentReminderRows[0]?.cnt ?? 0) > 0;

  // ── Compute current year for hero + reminder defaults (ADR-0001) ─────────
  const currentYear = berlinYear();

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

  // ── Find open beitrags (paidCents < betragCents, not exempt) ─────────────
  // Package B: openYears uses row data only — no VEREIN_BEITRAG_DEFAULT_CENTS
  // fabrication. A no-row year is handled by the canonical state resolver.
  const currentYearBeitrag = beitragRows.find((b) => b.year === currentYear);
  const openYears = beitragRows
    .filter((b) => !b.isExempt && Number(b.paidCents) < Number(b.betragCents))
    .map((b) => ({
      year: b.year,
      betragCents: Number(b.betragCents),
      paidCents: Number(b.paidCents),
    }));

  const defaultReminderYear = openYears[0]?.year ?? currentYear;
  // betragCents for the reminder: use the open row's recorded amount (no fallback
  // to VEREIN_BEITRAG_DEFAULT_CENTS — that was the false-debt fabrication removed
  // in Package B). If there is no open row, fall back to satz or 0.
  const defaultReminderBetragCents =
    openYears[0]?.betragCents ?? satzByYear[currentYear] ?? 0;

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
    reminderSentRecently,
    defaultReminderYear,
    defaultReminderBetragCents,
    mailFrom,
    currentYear,
    satzByYear,
    openYears,
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
    const memberId = params.id;
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

  // ── Send BeitragsReminder ─────────────────────────────────────────────────
  // Package B: uses checkReminderAllowed to refuse 422 when the member owes
  // nothing for the year (CARDINAL RULE — no false debt). VEREIN_BEITRAG_DEFAULT_CENTS
  // fabrication removed; betragCents comes from the canonical state resolver.
  "send-reminder": async ({ request, params }) => {
    const memberId = params.id;
    const formData = await request.formData();
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    if (!memberId || isNaN(year)) {
      return fail(400, {
        action: "send-reminder",
        error: "Ungültige Parameter",
      });
    }

    // False-debt guard: refuse when member owes nothing for the year.
    const guard = await checkReminderAllowed({ memberId, year });
    if (!guard.allowed) {
      return fail(guard.status, {
        action: "send-reminder",
        error: guard.error,
      });
    }

    const { member, betragCents } = guard;

    if (!member.email) {
      return fail(422, {
        action: "send-reminder",
        error: "Keine E-Mail-Adresse hinterlegt",
      });
    }

    // Org bank details — env.VEREIN_* is the only source of truth.
    const iban = env.VEREIN_IBAN;
    const bic = env.VEREIN_BIC;
    const bank = env.VEREIN_BANK;
    const empfaenger = env.VEREIN_NAME;
    if (!iban || !bic || !bank || !empfaenger) {
      return fail(500, {
        action: "send-reminder",
        error:
          "Vereins-Bankdaten (VEREIN_IBAN / VEREIN_BIC / VEREIN_BANK / VEREIN_NAME) sind nicht konfiguriert.",
      });
    }

    try {
      const result = await sendMail({
        template: "beitrag_reminder",
        entity_kind: "member",
        entity_id: memberId,
        to: member.email,
        props: {
          vorname: member.vorname,
          nachname: member.nachname,
          jahr: year,
          betragCents,
          iban,
          bic,
          bank,
          empfaenger,
        },
      });

      if (result.deduped) {
        return {
          action: "send-reminder",
          success: true,
          deduped: true,
          vorname: member.vorname,
        };
      }

      return {
        action: "send-reminder",
        success: true,
        deduped: false,
        vorname: member.vorname,
      };
    } catch (err) {
      console.error("send-reminder failed:", err);
      return fail(500, {
        action: "send-reminder",
        error: "Mail konnte nicht gesendet werden",
      });
    }
  },
};
