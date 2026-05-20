/**
 * /app/inbox/[ausId] — Audit Inbox detail view.
 *
 * load()  → fetch the submission by AUS-{YYYY}-{NNN} business_id, the linked
 *           member context (if any), and the linked expense (if already
 *           approved). Emits `auslage.reviewed` the first time an admin opens
 *           the card (handler sets reviewed_at + writes audit_log row).
 * actions:
 *   ?/approve → atomic create-expense + decide-submission (idempotent)
 *               — owned by approve-pay-flow; uses `submissionId` form field.
 *   ?/reject  → mark submission rejected + send RejectionMail (DB-deduped)
 *               — owned by approve-pay-flow; uses `submissionId` + `grund`.
 *
 * §4.1.1 #2: actions emit bus events; audit_log / mail dispatch are handled
 * by registered handlers, never inline.
 */

import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { members } from "$lib/server/db/schema/members.js";
import { zahlungsarten } from "$lib/server/db/schema/zahlungsarten.js";
import { parseBusinessId } from "$lib/domain/business-id.js";
import {
  approveSubmission,
  rejectSubmission,
} from "$lib/server/domain/audit-inbox-actions.js";
import { bus, registerHandlers } from "$lib/server/events/index.js";
import { maskIban, type InboxSubmissionDetailView } from "$lib/domain/inbox.js";

// Idempotent: ensures auslage.reviewed (and other) handlers are wired.
registerHandlers();

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ params, locals }) => {
  const { ausId } = params;

  // Path-level validation — AUS-{YYYY}-{NNN} format only.
  const parsed = parseBusinessId(ausId);
  if (!parsed || parsed.prefix !== "AUS") {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }

  const db = getDb();

  // ── Fetch the submission + linked member context in one query ────────────
  const rows = await db
    .select({
      submission: auslagenSubmissions,
      memberId: members.id,
      memberVorname: members.vorname,
      memberNachname: members.nachname,
      memberEmail: members.email,
      memberAustritt: members.austrittsDatum,
    })
    .from(auslagenSubmissions)
    .leftJoin(members, eq(members.id, auslagenSubmissions.bezahltVonMemberId))
    .where(eq(auslagenSubmissions.businessId, ausId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw error(404, `Keine Einreichung mit der ID „${ausId}" gefunden.`);
  }
  const s = row.submission;

  // ── Fetch linked expense (if already approved) ──────────────────────────
  let linkedExpense: typeof expenses.$inferSelect | null = null;
  if (s.approvedExpenseId) {
    const expRows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, s.approvedExpenseId))
      .limit(1);
    linkedExpense = expRows[0] ?? null;
  }

  // ── Fetch active zahlungsarten for the mark-erstattet form (Phase 5 reuse) ─
  const zahlungsartRows = await db
    .select({
      id: zahlungsarten.id,
      label: zahlungsarten.label,
      kind: zahlungsarten.kind,
    })
    .from(zahlungsarten)
    .where(eq(zahlungsarten.deactivated, false))
    .orderBy(zahlungsarten.label);

  // ── Emit auslage.reviewed when an admin opens an undecided card. The
  //    handler in handlers.ts is the authoritative guard: it issues an
  //    UPDATE ... WHERE reviewed_at IS NULL RETURNING id, and only writes
  //    the audit row when one row was actually changed. This route-level
  //    `wasUnreviewed` is only an optimisation to avoid a no-op round-trip
  //    on every refresh — concurrency safety is enforced inside the handler
  //    (A5: two simultaneous opens → exactly one audit row, exactly one
  //    UPDATE that lands).
  const wasUnreviewed = s.reviewedAt === null;
  if (wasUnreviewed && s.decidedAt === null) {
    try {
      await bus.emit("auslage.reviewed", {
        submissionId: s.id,
        ausId: s.businessId,
        actorUserId: locals.session!.user.id,
      });
    } catch (err) {
      // Best-effort: log and continue. The detail page should still render
      // even if the audit handler transiently fails.
      console.error(`[inbox/${ausId}] auslage.reviewed emit failed:`, err);
    }
  }

  const detail: InboxSubmissionDetailView = {
    id: s.id,
    ausId: s.businessId,
    bezeichnung: s.bezeichnung,
    betragCents: Number(s.betragCents),
    currency: s.currency,
    bezahltVonKind: s.bezahltVonKind,
    bezahltVonDisplay: s.bezahltVonDisplay,
    bezahltVonMemberId: s.bezahltVonMemberId ?? null,
    bezahltVonMemberDisplay:
      row.memberVorname && row.memberNachname
        ? `${row.memberVorname} ${row.memberNachname}`.trim()
        : null,
    rechnungsdatum: s.rechnungsdatum ?? null,
    submittedAt: s.submittedAt.toISOString(),
    // wasUnreviewed implies the bus.emit just set reviewed_at to now() — but
    // we projected `s` *before* the UPDATE landed. Use a fresh timestamp for
    // the UI; the next load will reflect the persisted value.
    reviewedAt: wasUnreviewed
      ? new Date().toISOString()
      : s.reviewedAt!.toISOString(),
    belegDriveFileId: s.belegDriveFileId ?? null,
    belegOriginalName: s.belegOriginalName ?? null,
    projectId: null,
    projectName: null,
    wofuer: s.wofuer ?? null,
    kommentar: s.kommentar ?? null,
    externName: s.externName ?? null,
    externIbanMasked: maskIban(s.externIban),
    externEmail: s.externEmail ?? null,
    consentTextVersion: s.consentTextVersion,
    consentGivenAt: s.consentGivenAt.toISOString(),
    submitterIpPrefix: s.submitterIpPrefix ?? null,
    // Use the canonical Drive view URL — works without an API call and
    // gracefully falls back to Drive's own login screen if the file is
    // restricted (BelegPreview handles the iframe failure path).
    belegViewLink: s.belegDriveFileId
      ? `https://drive.google.com/file/d/${s.belegDriveFileId}/view`
      : null,
    memberContext: row.memberId
      ? {
          id: row.memberId,
          vorname: row.memberVorname ?? "",
          nachname: row.memberNachname ?? "",
          email: row.memberEmail ?? null,
          austrittsDatum: row.memberAustritt ?? null,
        }
      : null,
  };

  return {
    submission: detail,
    // Decision metadata for the view (when an admin lands on an already-
    // decided card via a stale link — the page shows a "schon entschieden"
    // banner rather than the action buttons).
    decision: {
      decidedAt: s.decidedAt?.toISOString() ?? null,
      decision: s.decision,
      decisionReason: s.decisionReason,
      approvedExpenseId: s.approvedExpenseId,
    },
    linkedExpense: linkedExpense
      ? {
          id: linkedExpense.id,
          businessId: linkedExpense.businessId,
          status: linkedExpense.status,
          approvedAt: linkedExpense.approvedAt?.toISOString() ?? null,
          erstattetAm: linkedExpense.erstattetAm,
          zahlungsartId: linkedExpense.zahlungsartId,
        }
      : null,
    zahlungsarten: zahlungsartRows,
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  // ── Approve ─────────────────────────────────────────────────────────────
  approve: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id;
    if (!userId) {
      return fail(401, { action: "approve", error: "Nicht angemeldet" });
    }
    // Defense-in-depth: only admin role may approve an Auslagen submission.
    // Today only ADMIN_EMAILS-allowlisted users can sign in (so all sessions
    // are admin), but the role enum already supports `steuerberater` and
    // `member_self_service` for future flows — those roles must not be able
    // to approve expenses to themselves or others.
    if (locals.session?.user.role !== "admin") {
      return fail(403, { action: "approve", error: "Nicht berechtigt" });
    }

    const { ausId } = params;
    const parsed = parseBusinessId(ausId);
    if (!parsed || parsed.prefix !== "AUS") {
      return fail(400, { action: "approve", error: "Ungültige AUS-ID" });
    }

    // The form may or may not send the submission id; resolve from ausId.
    const formData = await request.formData();
    let submissionId = formData.get("submissionId")?.toString() ?? "";

    if (!submissionId) {
      const db = getDb();
      const rows = await db
        .select({ id: auslagenSubmissions.id })
        .from(auslagenSubmissions)
        .where(eq(auslagenSubmissions.businessId, ausId))
        .limit(1);
      if (!rows[0]) {
        return fail(404, {
          action: "approve",
          error: "Einreichung nicht gefunden",
        });
      }
      submissionId = rows[0].id;
    }

    const result = await approveSubmission({
      submissionId,
      actorUserId: userId,
    });

    if (!result.ok) {
      return fail(result.status, { action: "approve", error: result.error });
    }

    return {
      action: "approve",
      success: true,
      created: result.created,
      expenseId: result.expenseId,
      expenseBusinessId: result.expenseBusinessId,
    };
  },

  // ── Reject ──────────────────────────────────────────────────────────────
  reject: async ({ request, locals, params }) => {
    const userId = locals.session?.user.id;
    if (!userId) {
      return fail(401, { action: "reject", error: "Nicht angemeldet" });
    }
    // Defense-in-depth: only admin role may reject (see approve action above).
    if (locals.session?.user.role !== "admin") {
      return fail(403, { action: "reject", error: "Nicht berechtigt" });
    }

    const { ausId } = params;
    const parsed = parseBusinessId(ausId);
    if (!parsed || parsed.prefix !== "AUS") {
      return fail(400, { action: "reject", error: "Ungültige AUS-ID" });
    }

    const formData = await request.formData();
    const grund = formData.get("grund")?.toString() ?? "";
    let submissionId = formData.get("submissionId")?.toString() ?? "";

    if (!submissionId) {
      const db = getDb();
      const rows = await db
        .select({ id: auslagenSubmissions.id })
        .from(auslagenSubmissions)
        .where(eq(auslagenSubmissions.businessId, ausId))
        .limit(1);
      if (!rows[0]) {
        return fail(404, {
          action: "reject",
          error: "Einreichung nicht gefunden",
        });
      }
      submissionId = rows[0].id;
    }

    const result = await rejectSubmission({
      submissionId,
      actorUserId: userId,
      grund,
    });

    if (!result.ok) {
      return fail(result.status, { action: "reject", error: result.error });
    }

    return {
      action: "reject",
      success: true,
      alreadyDecided: result.alreadyDecided,
    };
  },
};
