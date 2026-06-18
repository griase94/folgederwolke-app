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
import { z } from "zod";
import { isNull, isNotNull, desc, eq, and, sql } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { members } from "$lib/server/db/schema/members.js";
import { isoCalendarDate } from "$lib/domain/date.js";
import { composeBezahltVonDisplay } from "$lib/server/domain/auslagen.js";
import { manualImportSubmission } from "$lib/server/domain/audit-inbox-actions.js";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";
import { validateIban, normalizeIban } from "$lib/server/domain/iban.js";
import type { InboxSubmissionView } from "$lib/domain/inbox.js";
import type { BezahltVon } from "$lib/server/domain/auslagen.js";

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

  // Counts for the filter chip badges + open-€ sum (header meta, spec §2.1) —
  // single round-trip via FILTER clauses.
  const [counts] = await db
    .select({
      offen: sql<number>`count(*) filter (where ${auslagenSubmissions.decidedAt} is null)::int`,
      geprueft: sql<number>`count(*) filter (where ${auslagenSubmissions.decision} = 'approved')::int`,
      abgelehnt: sql<number>`count(*) filter (where ${auslagenSubmissions.decision} = 'rejected')::int`,
      offenSummeCents: sql<number>`coalesce(sum(${auslagenSubmissions.betragCents}) filter (where ${auslagenSubmissions.decidedAt} is null), 0)::bigint`,
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
    offenSummeCents: Number(counts?.offenSummeCents ?? 0),
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Manual-import Zod schema (multipart, admin-only)
// ---------------------------------------------------------------------------

/**
 * Validates the flat multipart fields sent by ManualImportSheet (post-C4
 * rewrite). Intentionally separate from `auslageInputSchema` (public form):
 *   - No Datenschutz consent field (admin gate replaces it)
 *   - No beleg_name / beleg_mime_type (Beleg gate runs before Zod)
 *   - rechnungsdatum is optional (admin may not have the invoice at import time)
 *   - bezahlt_von parsed from flat fields (bezahlt_von_kind etc.)
 */
const manualImportSchema = z.object({
  bezeichnung: z
    .string()
    .min(3, "Bezeichnung muss mindestens 3 Zeichen haben")
    .max(200, "Bezeichnung zu lang"),
  betragCents: z.coerce
    .number()
    .int("Betrag muss ein ganzzahliger Cent-Betrag sein")
    .positive("Betrag muss positiv sein")
    .max(1_000_000_00, "Betrag überschreitet Limit"),
  currency: z.string().length(3).default("EUR"),
  rechnungsdatum: isoCalendarDate.nullable().optional(),
  kommentar: z.string().max(1000, "Kommentar zu lang").nullable().optional(),
  bezahlt_von_kind: z.enum(["verein", "member", "extern"]),
  // member arm
  member_id: z.string().uuid().nullable().optional(),
  member_display_name: z.string().max(120).nullable().optional(),
  member_email: z.string().email().max(254).nullable().optional(),
  // extern arm
  extern_name: z.string().max(120).nullable().optional(),
  extern_iban: z
    .string()
    .max(34)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeIban(v) : null)),
  extern_email: z.string().email().max(254).nullable().optional(),
  // Verein display name (white-label)
  verein_display_name: z.string().max(120).nullable().optional(),
});

export const actions: Actions = {
  /**
   * Manual-import: admin enters a submission on behalf of someone.
   *
   * Accepts multipart FormData (not the old JSON `data` field). Enforces THE
   * BELEG RULE verbatim from ausgaben/neu:
   *   ARM A — `beleg` File attached → upload via handleAuslageUpload
   *   ARM B — `keinBeleg=true` + `begruendung` (≥5 trimmed chars) → persist grund
   *   NEITHER → fail(422, errors.beleg)
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

    // ── 2. Beleg gate (verbatim from ausgaben/neu §4.1) ───────────────────
    const belegFormField = formData.get("beleg");
    const hasBelegFile =
      belegFormField instanceof File && belegFormField.size > 0;
    const keinBeleg = formData.get("keinBeleg") === "true";
    const begruendung = String(formData.get("begruendung") ?? "").trim();

    if (!hasBelegFile && !(keinBeleg && begruendung.length >= 5)) {
      return fail(422, {
        error:
          "Bitte einen Beleg hochladen oder „Kein Beleg vorhanden“ mit Begründung wählen.",
        errors: {
          beleg: ["Beleg-Datei ODER eine Begründung ist erforderlich."],
        },
      });
    }

    // ── 3. Validate remaining fields ──────────────────────────────────────
    const raw = Object.fromEntries(
      [...formData.entries()]
        .filter(([, v]) => !(v instanceof File))
        .map(([k, v]) => [k, v === "" ? null : v]),
    );

    const parsed = manualImportSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_root";
        if (!errors[key]) errors[key] = [];
        errors[key]!.push(issue.message);
      }
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        errors,
      });
    }

    const data = parsed.data;

    // ── 4. Build bezahlt_von discriminated union ──────────────────────────
    let bezahltVon: BezahltVon;
    if (data.bezahlt_von_kind === "member") {
      if (!data.member_id || !data.member_display_name) {
        return fail(422, {
          error: "Bitte ein Vereinsmitglied auswählen.",
          errors: { member: ["Bitte ein Vereinsmitglied auswählen."] },
        });
      }
      bezahltVon = {
        kind: "member",
        member_id: data.member_id,
        display_name: data.member_display_name,
        email: data.member_email ?? undefined,
      };
    } else if (data.bezahlt_von_kind === "extern") {
      if (!data.extern_name || !data.extern_iban || !data.extern_email) {
        return fail(422, {
          error: "Bitte alle Felder für externe Person ausfüllen.",
          errors: {
            extern_name: data.extern_name ? [] : ["Name ist erforderlich."],
            extern_iban: data.extern_iban ? [] : ["IBAN ist erforderlich."],
            extern_email: data.extern_email ? [] : ["E-Mail ist erforderlich."],
          },
        });
      }
      if (!validateIban(data.extern_iban)) {
        return fail(422, {
          error: "IBAN ist ungültig.",
          errors: { extern_iban: ["IBAN ungültig"] },
        });
      }
      bezahltVon = {
        kind: "extern",
        name: data.extern_name,
        iban: data.extern_iban,
        email: data.extern_email,
      };
    } else {
      bezahltVon = {
        kind: "verein",
        display_name: data.verein_display_name ?? undefined,
      };
    }

    // ── 5. Upload Beleg if ARM A ──────────────────────────────────────────
    let belegFileId: string | null = null;
    if (hasBelegFile) {
      try {
        const uploadResult = await handleAuslageUpload(belegFormField as File, {
          actorUserId,
          sourceKind: "app",
        });
        belegFileId = uploadResult.fileId;
      } catch (uploadErr) {
        const msg =
          uploadErr instanceof Error
            ? uploadErr.message
            : "Beleg konnte nicht hochgeladen werden.";
        return fail(422, {
          error: msg,
          errors: { beleg: [msg] },
        });
      }
    }

    // ── 6. Insert + emit event ────────────────────────────────────────────
    let result: { submissionId: string; ausId: string };
    try {
      result = await manualImportSubmission({
        bezahlt_von: bezahltVon,
        bezeichnung: data.bezeichnung,
        kommentar: data.kommentar ?? null,
        rechnungsdatum: data.rechnungsdatum ?? null,
        betragCents: data.betragCents,
        currency: data.currency,
        belegFileId,
        belegVerzichtGrund: belegFileId ? null : begruendung,
        actorUserId,
      });
    } catch (err) {
      console.error("[inbox/manual-import] failed:", err);
      return fail(500, {
        error: "Fehler beim Speichern. Bitte erneut versuchen.",
      });
    }

    // ── 7. Return success payload ─────────────────────────────────────────
    return {
      success: true,
      ausId: result.ausId,
    };
  },
};
