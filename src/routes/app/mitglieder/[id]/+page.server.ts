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
import { and, eq, gt, count, desc } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import {
  editMember,
  softDeleteMember,
  markBeitragPaid,
} from "$lib/server/domain/members-actions.js";
import { sendMail } from "$lib/server/mail/index.js";
import { env } from "$lib/server/env.js";

// Default Beitrag rate in cents (69.69 €) — until Einstellungen tab in Phase 4.
const DEFAULT_BEITRAG_CENTS = 6969n;

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

  // ── Compute current year for default reminder target ─────────────────────
  const currentYear = new Date().getFullYear();

  // ── Org constants for mail preview ───────────────────────────────────────
  const mailFrom = env.MAIL_FROM || "noreply@folgederwolke.de";

  // ── Find open beitrag for current year (for reminder defaults) ───────────
  const currentYearBeitrag = beitragRows.find((b) => b.year === currentYear);
  const openYears = beitragRows.filter(
    (b) => Number(b.paidCents) < Number(b.betragCents),
  );
  const defaultReminderYear = openYears[0]?.year ?? currentYear;
  const defaultReminderBetragCents = openYears[0]
    ? Number(openYears[0].betragCents)
    : Number(DEFAULT_BEITRAG_CENTS);

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
    currentYearBeitrag: currentYearBeitrag
      ? {
          id: currentYearBeitrag.id,
          betragCents: Number(currentYearBeitrag.betragCents),
          paidCents: Number(currentYearBeitrag.paidCents),
        }
      : null,
  };
};

export const actions: Actions = {
  // ── Edit member ─────────────────────────────────────────────────────────────
  edit: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;
    // Fall back to the route param when the form omits the id.
    if (!raw.id && params.id) raw.id = params.id;

    const result = await editMember(raw, userId);
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
    const formData = await request.formData();
    const id = formData.get("id")?.toString() || params.id || "";

    const result = await softDeleteMember(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Mark Beitrag paid ─────────────────────────────────────────────────────
  "mark-beitrag-paid": async ({ request, locals, params }) => {
    const userId = locals.session?.user.id ?? null;
    const memberId = params.id;
    const formData = await request.formData();
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    const result = await markBeitragPaid(memberId, year, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "mark-beitrag-paid",
        error: result.error,
      });
    }

    return { action: "mark-beitrag-paid", success: true };
  },

  // ── Send BeitragsReminder ─────────────────────────────────────────────────
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

    const db = getDb();

    // Fetch member
    const memberRows = await db
      .select()
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);

    if (!memberRows[0]) {
      return fail(404, {
        action: "send-reminder",
        error: "Mitglied nicht gefunden",
      });
    }

    const member = memberRows[0];

    if (!member.email) {
      return fail(422, {
        action: "send-reminder",
        error: "Keine E-Mail-Adresse hinterlegt",
      });
    }

    // Fetch beitrag for year (to get betrag_cents)
    const beitragRows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, memberId),
          eq(memberBeitrags.year, year),
        ),
      )
      .limit(1);

    const betragCents = beitragRows[0]
      ? Number(beitragRows[0].betragCents)
      : Number(DEFAULT_BEITRAG_CENTS);

    // Org bank details — env.VEREIN_* is the only source of truth. No
    // string-literal fallbacks: mismatched IBAN/BIC fallbacks were the
    // pre-existing bug surfaced by cycle-2 review F2. If the env is
    // unset, refuse the action and report it to the admin — silently
    // sending wrong bank data is worse than failing loudly.
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
