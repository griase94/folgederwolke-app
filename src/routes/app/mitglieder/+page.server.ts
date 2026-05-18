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
import { beitragYearsRange } from "$lib/server/domain/members.js";
import {
  addMember,
  editMember,
  softDeleteMember,
  markBeitragPaid,
} from "$lib/server/domain/members-actions.js";

export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();
  const view = url.searchParams.get("view") === "matrix" ? "matrix" : "list";
  const years = beitragYearsRange();

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

  return {
    view,
    years,
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
  default: async ({ request, locals }) => {
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

  // ── Mark Beitrag paid ───────────────────────────────────────────────────────
  "mark-beitrag-paid": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const memberId = formData.get("member_id")?.toString() ?? "";
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
};
