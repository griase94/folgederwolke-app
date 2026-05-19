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
import { isNull, desc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { members } from "$lib/server/db/schema/members.js";
import { validateAuslageInput } from "$lib/server/domain/auslagen.js";
import { manualImportSubmission } from "$lib/server/domain/audit-inbox-actions.js";
import type { InboxSubmissionView } from "$lib/domain/inbox.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb();

  // All open (un-decided) submissions, newest first, with the linked member
  // joined in so we can show "Mitglied: Max Mustermann" with the live name
  // (the snapshot `bezahlt_von_display` is preserved on the row for audit but
  // we render the live name where possible). LEFT JOIN: members may have been
  // deleted between submission and review.
  const rows = await db
    .select({
      submission: auslagenSubmissions,
      memberVorname: members.vorname,
      memberNachname: members.nachname,
    })
    .from(auslagenSubmissions)
    .leftJoin(members, eq(members.id, auslagenSubmissions.bezahltVonMemberId))
    .where(isNull(auslagenSubmissions.decidedAt))
    .orderBy(desc(auslagenSubmissions.submittedAt));

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
      belegOriginalName: s.belegOriginalName ?? null,
      projectId: null, // submissions do not link a project yet
      projectName: null,
      wofuer: s.wofuer ?? null,
      kommentar: s.kommentar ?? null,
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

    // Admin path: inject a synthetic consent_text_version so the Zod schema
    // passes (admin doesn't see the Datenschutz checkbox).
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      if (!p["consent_text_version"]) {
        // Import from server domain — avoids importing the client-only re-export
        const { DATENSCHUTZ_VERSION } =
          await import("$lib/server/domain/datenschutz.js");
        p["consent_text_version"] = DATENSCHUTZ_VERSION;
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
};
