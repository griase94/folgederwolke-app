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
} from "$lib/server/domain/members-actions.js";
import { currentBuchungsjahr, selectYearFromUrl } from "$lib/domain/year.js";

export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();
  const view = url.searchParams.get("view") === "matrix" ? "matrix" : "list";
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

  return {
    view,
    years,
    totalsByYear,
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
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = await addMember(raw, userId);
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
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

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
  delete: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await softDeleteMember(id, userId);
    if (!result.ok) {
      return fail(result.status, { action: "delete", error: result.error });
    }

    return { action: "delete", success: true };
  },

  // ── Restore soft-deleted member (undo) ──────────────────────────────────────
  restore: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    const result = await restoreMember(id, userId);
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
    const memberId = formData.get("member_id")?.toString() ?? "";
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    const result = await markBeitragPaid(memberId, year, userId, userRole);
    if (!result.ok) {
      return fail(result.status, {
        action: "mark-beitrag-paid",
        error: result.error,
      });
    }

    return { action: "mark-beitrag-paid", success: true };
  },
};
