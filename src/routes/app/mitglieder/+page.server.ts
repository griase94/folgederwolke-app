/**
 * /app/mitglieder — Mitglieder list + matrix page.
 *
 * load()    → fetches all members + beitrags for the 3-year window
 * actions:
 *   default (?/add)        → add a new member
 *   ?/edit                 → edit an existing member
 *   ?/delete               → soft-delete (sets austritts_datum = today)
 *   ?/mark-beitrag-paid    → mark a member's beitrag year as fully paid
 *
 * Action logic is delegated to `$lib/server/domain/members-actions.ts` so the
 * same write paths are reused by `/app/mitglieder/[id]/+page.server.ts`.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { beitragYearsRange } from "$lib/server/domain/members.js";
import {
  addMember,
  editMember,
  softDeleteMember,
  restoreMember,
  markBeitragPaid,
  markBeitragPaidBulk,
  markBeitragUnpaid,
  setBeitragExempt,
  checkReminderAllowed,
  sendBeitragReminderBulk,
} from "$lib/server/domain/members-actions.js";
import {
  reminderSendAttempt,
  remindedMemberIdsForYear,
  resolveReminderFrist,
  vereinBankIdentity,
} from "$lib/server/domain/beitrag-reminder.js";
import { bus } from "$lib/server/events/index.js";
import { loadMatrix } from "$lib/server/domain/matrix-loader.js";
import {
  berlinYmd,
  currentBuchungsjahr,
  selectYearFromUrl,
} from "$lib/domain/year.js";

export const load: PageServerLoad = async ({ url, depends }) => {
  // PR3b: register a scoped dependency so the optimistic Beitragsmatrix can
  // reconcile via `invalidate('app:beitrags-matrix')` after a mutation —
  // re-running ONLY this load instead of the whole `invalidateAll()` graph
  // (which would re-fire the ~30-query dashboard load too). The mark-paid
  // matrix data is produced here (loadMatrix + totalsByYear), so this load is
  // the single re-fetch target.
  depends("app:beitrags-matrix");

  const db = getDb();
  const view = url.searchParams.get("view") === "matrix" ? "matrix" : "list";
  const filter = url.searchParams.get("filter") as
    | "ueberfaellig"
    | "offen"
    | null;
  // C2-2: anchor the Beitragsmatrix on ?year= (selected year ± 1). Falls back
  // to the current Buchungsjahr when ?year is absent or malformed.
  const anchorYear = selectYearFromUrl(url.searchParams, currentBuchungsjahr());
  const years = beitragYearsRange(anchorYear);

  // F15: the list must show the SAME member population as every other surface
  // (matrix, dashboard, year report, picker). The old NODE_ENV=production
  // `is_fixture=false` filter made the list undercount ("1 of 6") while the
  // matrix/dashboard showed all members — a single hidden cross-surface
  // divergence. Per "pre-launch data is disposable", fixtures are purged from
  // prod via a one-time DELETE (the documented cutover step), not hidden on one
  // of six surfaces. Show what the rest of the app shows.
  const allMembers = await db
    .select()
    .from(members)
    .orderBy(members.nachname, members.vorname);

  // Single source of beitrag cell state: per-(member, year) state + year-header
  // totals + the festBis lock, all derived once via resolveBeitragState. The
  // list surfaces (pills + bulk gate) read cells from here — there is no parallel
  // member_beitrags projection any more (Aurora C-S2: legacy dual model dropped).
  const matrix = await loadMatrix({ years });

  return {
    view,
    filter,
    years,
    matrix,
    // Member identity/contact only — beitrag state lives in `matrix`.
    members: allMembers.map((m) => ({
      id: m.id,
      vorname: m.vorname,
      nachname: m.nachname,
      email: m.email,
      iban: m.iban,
      telefon: m.telefon,
      adresse: m.adresse,
      dateOfBirth: m.dateOfBirth,
      role: m.role,
      eintrittsDatum: m.eintrittsDatum,
      austrittsDatum: m.austrittsDatum,
      beitragExempt: m.beitragExempt,
      beitragExemptReason: m.beitragExemptReason,
      isFixture: m.isFixture,
      createdAt: m.createdAt.toISOString(),
    })),
  };
};

export const actions: Actions = {
  // ── Add member ─────────────────────────────────────────────────────────────
  // Named `add` instead of `default:` — SvelteKit forbids mixing default with
  // named actions on the same route. AddMemberDialog posts to `?/add`.
  add: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await addMember(raw, userId, userRole);
    if (!result.ok) {
      return fail(result.status, {
        action: "add",
        errors: result.errors,
        values: result.values,
      });
    }

    return { action: "add", success: true, memberId: result.memberId };
  },

  // ── Edit member ─────────────────────────────────────────────────────────────
  edit: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

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
  delete: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await softDeleteMember(id, userId, userRole);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Restore soft-deleted member (undo) ──────────────────────────────────────
  restore: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await restoreMember(id, userId, userRole);
    if (!result.ok) {
      return fail(result.status, { action: "restore", error: result.error });
    }

    return { action: "restore", success: true };
  },

  // ── Mark Beitrag paid ───────────────────────────────────────────────────────
  "mark-beitrag-paid": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    // Accept both "memberId" (new popover) and "member_id" (legacy form) field names
    const memberId =
      formData.get("memberId")?.toString() ||
      formData.get("member_id")?.toString() ||
      "";
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

    if (!memberId || !Number.isFinite(year)) {
      return fail(400, {
        action: "mark-beitrag-paid",
        error: "Ungültige Parameter",
      });
    }

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

  // ── Bulk mark Beitrag paid (Mitglieder list multi-select) ───────────────────
  "mark-beitrag-paid-bulk": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    // memberIds posted as repeated "memberId" fields.
    const memberIds = formData
      .getAll("memberId")
      .map((v) => v.toString())
      .filter(Boolean);
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);
    const gezahltAm = formData.get("gezahltAm")?.toString() || berlinYmd();

    if (memberIds.length === 0 || !Number.isFinite(year)) {
      return fail(400, {
        action: "mark-beitrag-paid-bulk",
        error: "Ungültige Parameter",
      });
    }

    const result = await markBeitragPaidBulk({
      memberIds,
      year,
      gezahltAm,
      actorUserId: userId,
      actorRole: userRole,
    });
    if (!result.ok) {
      return fail(result.status, {
        action: "mark-beitrag-paid-bulk",
        error: result.error,
      });
    }

    return {
      action: "mark-beitrag-paid-bulk",
      success: true,
      paidCount: result.paidCount,
      skippedCount: result.skipped.length,
    };
  },

  // ── Task 2.8: Mark Beitrag unpaid (storno) ──────────────────────────────────
  "mark-beitrag-unpaid": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const memberId = formData.get("memberId")?.toString() ?? "";
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    if (!memberId || !Number.isFinite(year)) {
      return fail(400, {
        action: "mark-beitrag-unpaid",
        error: "Ungültige Parameter",
      });
    }

    const result = await markBeitragUnpaid({
      memberId,
      year,
      actorUserId: userId,
      actorRole: userRole,
    });
    if (!result.ok) {
      return fail(result.status, {
        action: "mark-beitrag-unpaid",
        error: result.error,
      });
    }

    return { action: "mark-beitrag-unpaid", success: true };
  },

  // ── Task 2.8: Set Beitrag exempt (per-year) ──────────────────────────────────
  "set-beitrag-exempt": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const formData = await request.formData();
    const memberId = formData.get("memberId")?.toString() ?? "";
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);
    const exemptStr = formData.get("exempt")?.toString() ?? "true";
    const exempt = exemptStr === "true" || exemptStr === "on";
    const reason = formData.get("reason")?.toString() ?? "";

    if (!memberId || !Number.isFinite(year)) {
      return fail(400, {
        action: "set-beitrag-exempt",
        error: "Ungültige Parameter",
      });
    }

    const result = await setBeitragExempt({
      memberId,
      year,
      exempt,
      reason: exempt ? reason : undefined,
      actorUserId: userId,
      actorRole: userRole,
    });
    if (!result.ok) {
      return fail(result.status, {
        action: "set-beitrag-exempt",
        error: result.error,
      });
    }

    return { action: "set-beitrag-exempt", success: true };
  },

  // ── Send Beitrag reminder (single) ────────────────────────────────────────
  // Package B: uses checkReminderAllowed to refuse 422 when the member owes
  // nothing for the year (CARDINAL RULE — no false debt). The mail now goes
  // through the event bus (`beitrag.reminder_requested`), never inline sendMail
  // (§4.1.1 #2, ADR-0005). send_attempt is jahresbasiert (identical to cron +
  // Bulk) so the (member, year) dedup key is shared across all send paths.
  //
  // S3b will delete this action + its per-row buttons: the single reminder
  // becomes the n=1 case of the Bulk sheet (`?/send-reminder-bulk`, Ruling C6a).
  "send-reminder": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    // Admin-only gate
    if (userRole !== "admin") {
      return fail(403, { action: "send-reminder", error: "Nur Admins." });
    }
    const formData = await request.formData();
    const memberId = formData.get("memberId")?.toString() ?? "";
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    if (!memberId || !Number.isFinite(year)) {
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

    const bank = vereinBankIdentity();
    if (!bank) {
      return fail(500, {
        action: "send-reminder",
        error:
          "Vereins-Bankdaten (VEREIN_IBAN / VEREIN_BIC / VEREIN_BANK / VEREIN_NAME) sind nicht konfiguriert.",
      });
    }

    // Already reminded for this (member, year)? → honest "already sent", no 2nd
    // mail (the sent_mails UNIQUE would dedup anyway; this reports it truthfully).
    const already = await remindedMemberIdsForYear([memberId], year);
    if (already.has(memberId)) {
      return {
        action: "send-reminder",
        success: true,
        deduped: true,
        vorname: member.vorname,
      };
    }

    try {
      await bus.emit("beitrag.reminder_requested", {
        memberId,
        year,
        to: member.email,
        vorname: member.vorname,
        nachname: member.nachname,
        betragCents,
        iban: bank.iban,
        bic: bank.bic,
        bank: bank.bank,
        empfaenger: bank.empfaenger,
        fristAt: await resolveReminderFrist(year),
        customIntro: null,
        sendAttempt: reminderSendAttempt(year),
        actorUserId: userId,
      });
      return {
        action: "send-reminder",
        success: true,
        deduped: false,
        vorname: member.vorname,
      };
    } catch {
      return fail(500, {
        action: "send-reminder",
        error: "Mail konnte nicht gesendet werden",
      });
    }
  },

  // ── Send Beitrag reminders (Bulk) ─────────────────────────────────────────
  // The consolidated reminder endpoint (erinnerung-senden §6.1): one recipient
  // is just n=1. Iterates the false-debt guard per member, respects the
  // per-(member, year) dedup, emits on the bus, and returns the per-recipient
  // digest that the sheet's result-state renders. `memberIds` posted as repeated
  // fields; optional `fristAt` (sheet date) + `customIntro` (edited intro).
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
