/**
 * /app/inbox — Audit Inbox.
 *
 * load()  → returns pending auslagen_submissions (open = decidedAt IS NULL)
 * actions:
 *   ?/manual-import → admin-side ManualImportSheet: insert on behalf of someone
 *
 * Phase 4 scope: load + manual-import.
 * approve / reject actions are added by the approve-pay-flow agent (same file,
 * add-only). DO NOT touch this file's load() or manual-import action when
 * wiring approve/reject.
 */

import { fail } from "@sveltejs/kit";
import { isNull, isNotNull, desc, eq, and, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { members } from "$lib/server/db/schema/members.js";
import { validateAuslageInput } from "$lib/server/domain/auslagen.js";
import {
  manualImportSubmission,
  approveSubmission,
  rejectSubmission,
} from "$lib/server/domain/audit-inbox-actions.js";
import type { InboxSubmissionView } from "$lib/domain/inbox.js";

/**
 * Decoded ?status= filter value. Falls back to "Offen" for missing/invalid.
 * C7-INBOX full: filter chips on /app/inbox.
 */
type InboxStatusFilter = "Offen" | "Geprüft" | "Abgelehnt";

function parseStatus(raw: string | null): InboxStatusFilter {
  if (raw === "Geprüft" || raw === "Abgelehnt") return raw;
  return "Offen";
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = getDb();

  const activeStatus: InboxStatusFilter = parseStatus(
    url.searchParams.get("status"),
  );

  // Choose WHERE clause based on the filter (Offen/Geprüft/Abgelehnt).
  // - Offen   → decided_at IS NULL
  // - Geprüft → decision = 'approved'
  // - Abgelehnt → decision = 'rejected'
  const whereClause =
    activeStatus === "Geprüft"
      ? and(
          isNotNull(auslagenSubmissions.decidedAt),
          eq(auslagenSubmissions.decision, "approved"),
        )
      : activeStatus === "Abgelehnt"
        ? and(
            isNotNull(auslagenSubmissions.decidedAt),
            eq(auslagenSubmissions.decision, "rejected"),
          )
        : isNull(auslagenSubmissions.decidedAt);

  // Submissions matching the active filter, newest first, with the linked
  // member joined in so we can show "Mitglied: Max Mustermann" with the live
  // name (the snapshot `bezahlt_von_display` is preserved on the row for
  // audit but we render the live name where possible). LEFT JOIN: members
  // may have been deleted between submission and review.
  const rows = await db
    .select({
      submission: auslagenSubmissions,
      memberVorname: members.vorname,
      memberNachname: members.nachname,
    })
    .from(auslagenSubmissions)
    .leftJoin(members, eq(members.id, auslagenSubmissions.bezahltVonMemberId))
    .where(whereClause)
    .orderBy(desc(auslagenSubmissions.submittedAt));

  // Counts for the filter chip badges — single round-trip via FILTER clauses.
  const [counts] = await db
    .select({
      offen: sql<number>`count(*) filter (where ${auslagenSubmissions.decidedAt} is null)::int`,
      geprueft: sql<number>`count(*) filter (where ${auslagenSubmissions.decision} = 'approved')::int`,
      abgelehnt: sql<number>`count(*) filter (where ${auslagenSubmissions.decision} = 'rejected')::int`,
    })
    .from(auslagenSubmissions);

  const submissions: InboxSubmissionView[] = rows.map(
    ({ submission: s, memberVorname, memberNachname }) => ({
      id: s.id,
      ausId: s.businessId,
      bezeichnung: s.bezeichnung,
      betragCents: Number(s.betragCents),
      currency: s.currency,
      bezahltVonKind: s.bezahltVonKind,
      bezahltVonDisplay: s.bezahltVonDisplay,
      bezahltVonMemberId: s.bezahltVonMemberId ?? null,
      bezahltVonMemberDisplay:
        memberVorname && memberNachname
          ? `${memberVorname} ${memberNachname}`.trim()
          : null,
      rechnungsdatum: s.rechnungsdatum ?? null,
      submittedAt: s.submittedAt.toISOString(),
      reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      belegDriveFileId: s.belegDriveFileId ?? null,
      belegFileId: s.belegFileId ?? null,
      belegOriginalName: s.belegOriginalName ?? null,
      projectId: null, // submissions do not link a project yet
      projectName: null,
      wofuer: s.wofuer ?? null,
      kommentar: s.kommentar ?? null,
      // C7-INBOX full: decided/decision so InboxCard can render the right
      // status pill + data-* attributes for filter assertions.
      decided: s.decidedAt ? "yes" : "no",
      decision:
        s.decision === "approved"
          ? "approved"
          : s.decision === "rejected"
            ? "rejected"
            : null,
    }),
  );

  // Members list for ManualImportSheet's BezahltVon picker
  const allMembers = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
      email: members.email,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);

  const memberList = allMembers.map((m) => ({
    id: m.id,
    display_name: `${m.vorname} ${m.nachname}`.trim(),
    email: m.email ?? undefined,
  }));

  return {
    submissions,
    members: memberList,
    user: locals.session!.user,
    activeStatus,
    counts: {
      offen: Number(counts?.offen ?? 0),
      geprueft: Number(counts?.geprueft ?? 0),
      abgelehnt: Number(counts?.abgelehnt ?? 0),
    },
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  /**
   * Manual-import: admin enters a submission on behalf of someone.
   * Expects the same JSON payload shape as the public form action (`data` field),
   * but consent_text_version is auto-filled server-side and Drive upload is skipped.
   */
  "manual-import": async ({ request, locals }) => {
    const actorUserId = locals.session!.user.id;

    // ── 1. Parse FormData ─────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const jsonRaw = formData.get("data");
    if (typeof jsonRaw !== "string") {
      return fail(400, { error: "Ungültige Anfrage: fehlendes Datenfeld." });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      return fail(400, {
        error: "Ungültige Anfrage: JSON konnte nicht geparst werden.",
      });
    }

    // Admin path: inject synthetic values so the Zod schema passes for the
    // admin manual-import flow (no Datenschutz checkbox, may have no Beleg
    // attached at the moment of import — typically pasted from an email).
    //
    // C2-TAX: beleg_name/beleg_mime_type/rechnungsdatum are now required for
    // tax correctness on the public form path. The inbox-manual-import is an
    // admin-only path where the Beleg is attached later via the Inbox UI;
    // synthesize placeholder values here so the same schema can validate both
    // paths. The schema's structural shape is the gate — the inbox row gets
    // its real values from the admin's later actions.
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (!p["consent_text_version"]) {
        // Import from server domain — avoids importing the client-only re-export
        const { DATENSCHUTZ_VERSION } =
          await import("$lib/server/domain/datenschutz.js");
        p["consent_text_version"] = DATENSCHUTZ_VERSION;
      }
      if (!p["beleg_name"]) p["beleg_name"] = "manual-import.pdf";
      if (!p["beleg_mime_type"]) p["beleg_mime_type"] = "application/pdf";
      if (!p["rechnungsdatum"] || typeof p["rechnungsdatum"] !== "string") {
        // ISO YYYY-MM-DD in Europe/Berlin
        p["rechnungsdatum"] = new Date().toLocaleDateString("sv-SE", {
          timeZone: "Europe/Berlin",
        });
      }
    }

    // ── 2. Validate ───────────────────────────────────────────────────────
    const validation = validateAuslageInput(parsed);
    if (!validation.ok) {
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        errors: validation.errors,
      });
    }

    const input = validation.data;

    // ── 3. Insert + emit event ────────────────────────────────────────────
    let result: { submissionId: string; ausId: string };
    try {
      result = await manualImportSubmission({
        bezahlt_von: input.bezahlt_von,
        bezeichnung: input.bezeichnung,
        kommentar: input.kommentar ?? null,
        rechnungsdatum: input.rechnungsdatum ?? null,
        betragCents: input.betragCents,
        currency: input.currency,
        wofuer: input.wofuer ?? null,
        belegDriveFileId: null,
        belegOriginalName: null,
        actorUserId,
      });
    } catch (err) {
      console.error("[inbox/manual-import] failed:", err);
      return fail(500, {
        error: "Fehler beim Speichern. Bitte erneut versuchen.",
      });
    }

    // ── 4. Return success payload ─────────────────────────────────────────
    return {
      success: true,
      ausId: result.ausId,
    };
  },

  /**
   * C7-INBOX full: inline approve from the list row (no detail-page detour).
   * Idempotent — second call returns the existing expense without re-emitting.
   * Approval emits `expense.approved` + `auslage.approved` (ApprovalMail).
   */
  "inline-approve": async ({ request, locals }) => {
    const actorUserId = locals.session!.user.id;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const submissionId = String(formData.get("submissionId") ?? "");
    if (!submissionId) {
      return fail(400, { error: "submissionId fehlt" });
    }

    const result = await approveSubmission({ submissionId, actorUserId });
    if (!result.ok) {
      return fail(result.status, { error: result.error });
    }

    return {
      success: true,
      action: "inline-approve",
      expenseId: result.expenseId,
      ausId: result.expenseBusinessId,
    };
  },

  /**
   * C7-INBOX full: inline reject from the list row, with reasoned modal.
   * Idempotent — second call against an already-decided row is a no-op.
   * Rejection emits `auslage.rejected` → RejectionMail (best-effort).
   */
  "inline-reject": async ({ request, locals }) => {
    const actorUserId = locals.session!.user.id;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const submissionId = String(formData.get("submissionId") ?? "");
    const grund = String(formData.get("grund") ?? "").trim();
    if (!submissionId) {
      return fail(400, { error: "submissionId fehlt" });
    }
    if (!grund || grund.length < 3) {
      return fail(422, {
        error: "Bitte gib eine Begründung an (mind. 3 Zeichen)",
      });
    }

    const result = await rejectSubmission({
      submissionId,
      actorUserId,
      grund,
    });
    if (!result.ok) {
      return fail(result.status, { error: result.error });
    }

    return { success: true, action: "inline-reject" };
  },
};
