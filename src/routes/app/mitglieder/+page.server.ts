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
import { and, inArray } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import {
  beitragYearsRange,
  memberBeitragsTotals,
  type MemberBeitragsTotals,
} from "$lib/server/domain/members.js";
import {
  addMember,
  editMember,
  softDeleteMember,
  restoreMember,
  markBeitragPaid,
  markBeitragPaidBulk,
  markBeitragUnpaid,
  setBeitragExempt,
} from "$lib/server/domain/members-actions.js";
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

  const allMembers = await db
    .select()
    .from(members)
    .orderBy(members.nachname, members.vorname);

  const memberIds = allMembers.map((m) => m.id);

  let beitrags: (typeof memberBeitrags.$inferSelect)[] = [];
  if (memberIds.length > 0) {
    beitrags = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          inArray(memberBeitrags.memberId, memberIds),
          inArray(memberBeitrags.year, years),
        ),
      );
  }

  // Per-year Beitragssatz (configured fee) for the window. Used to seed the
  // mark-paid popover's amount when a member has NO member_beitrags row yet for
  // an open year — otherwise the confirm heading shows "0,00 €" while the server
  // would actually book the configured Satz (markpaid-popover-zero-betrag).
  let satzRows: { year: number; cents: bigint }[] = [];
  if (years.length > 0) {
    satzRows = await db
      .select({
        year: beitragssatzByYear.year,
        cents: beitragssatzByYear.cents,
      })
      .from(beitragssatzByYear)
      .where(inArray(beitragssatzByYear.year, years));
  }
  const satzByYear: Record<number, number> = {};
  for (const s of satzRows) satzByYear[s.year] = Number(s.cents);

  // Build a lookup map: memberId → year → beitrag row
  const beitragMap: Record<string, Record<number, (typeof beitrags)[0]>> = {};
  for (const b of beitrags) {
    if (!beitragMap[b.memberId]) beitragMap[b.memberId] = {};
    (beitragMap[b.memberId] as Record<number, (typeof beitrags)[0]>)[b.year] =
      b;
  }

  // C5-MEM-lite — €-summen header for the Mitglieder-Matrix. Compute per-year
  // totals in parallel so the year-tab switcher can render counts/sums for
  // any year in the 3-year window without an extra fetch on the client.
  const totalsArr = await Promise.all(
    years.map((y) => memberBeitragsTotals(y)),
  );
  const totalsByYear: Record<number, MemberBeitragsTotals> = {};
  years.forEach((y, i) => {
    totalsByYear[y] = totalsArr[i] as MemberBeitragsTotals;
  });

  // Task 2.0: matrix loader — per-cell state + year-header totals + filter support.
  // Loaded in parallel with legacy data to keep backward compat during Phase 2 transition.
  const matrix = await loadMatrix({ years });

  return {
    view,
    filter,
    years,
    totalsByYear,
    satzByYear,
    matrix,
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
      // Night-2 C5-MEM-full: surface exempt-flag + reason to the client so
      // MemberRow can render the `befreit` badge and EditMemberDialog can
      // pre-fill the toggle on edit.
      beitragExempt: m.beitragExempt,
      beitragExemptReason: m.beitragExemptReason,
      isFixture: m.isFixture,
      createdAt: m.createdAt.toISOString(),
      beitrags: Object.fromEntries(
        years.map((y) => {
          const b = beitragMap[m.id]?.[y];
          return [
            y,
            b
              ? {
                  id: b.id,
                  betragCents: Number(b.betragCents),
                  paidCents: Number(b.paidCents),
                  gezahltAm: b.gezahltAm,
                }
              : null,
          ];
        }),
      ),
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

  // ── Task 2.8: Send Beitrag reminder ──────────────────────────────────────────
  "send-reminder": async ({ request, locals }) => {
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

    // Delegate to the member-detail send-reminder logic (same implementation)
    // by calling the action on [id]/+page.server.ts would require a request —
    // instead inline the minimal path here.
    const db = getDb();
    const { env } = await import("$lib/server/env.js");
    const { sendMail } = await import("$lib/server/mail/index.js");
    const { members: membersTable, memberBeitrags: memberBeitragsTable } =
      await import("$lib/server/db/schema/members.js");
    const { eq, and } = await import("drizzle-orm");

    const [member] = await db
      .select()
      .from(membersTable)
      .where(eq(membersTable.id, memberId))
      .limit(1);

    if (!member) {
      return fail(404, {
        action: "send-reminder",
        error: "Mitglied nicht gefunden",
      });
    }
    if (!member.email) {
      return fail(422, {
        action: "send-reminder",
        error: "Keine E-Mail-Adresse hinterlegt",
      });
    }
    if (member.beitragExempt) {
      return fail(422, {
        action: "send-reminder",
        error: "Mitglied ist von der Beitragspflicht befreit",
      });
    }

    const [beitragRow] = await db
      .select()
      .from(memberBeitragsTable)
      .where(
        and(
          eq(memberBeitragsTable.memberId, memberId),
          eq(memberBeitragsTable.year, year),
        ),
      )
      .limit(1);

    const betragCents = beitragRow
      ? Number(beitragRow.betragCents)
      : env.VEREIN_BEITRAG_DEFAULT_CENTS;

    const iban = env.VEREIN_IBAN;
    const bic = env.VEREIN_BIC;
    const bank = env.VEREIN_BANK;
    const empfaenger = env.VEREIN_NAME;
    if (!iban || !bic || !bank || !empfaenger) {
      return fail(500, {
        action: "send-reminder",
        error: "Vereins-Bankdaten nicht konfiguriert",
      });
    }

    try {
      await sendMail({
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
      return {
        action: "send-reminder",
        success: true,
        vorname: member.vorname,
      };
    } catch {
      return fail(500, {
        action: "send-reminder",
        error: "Mail konnte nicht gesendet werden",
      });
    }
  },
};
