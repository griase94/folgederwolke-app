/**
 * /app/mitglieder — Mitglieder list + matrix page.
 *
 * load()    → fetches all members + beitrags for the 3-year window
 * actions:
 *   default (?/add)        → add a new member
 *   ?/edit                 → edit an existing member
 *   ?/delete               → soft-delete (sets austritts_datum = today)
 *   ?/mark-beitrag-paid    → mark a member's beitrag year as fully paid
 */

import { fail } from "@sveltejs/kit";
import { eq, and, inArray } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import {
  validateAddMember,
  validateEditMember,
  beitragYearsRange,
} from "$lib/server/domain/members.js";
import { bus } from "$lib/server/events/index.js";

// Default Beitrag rate in cents (69.69 €) — until Einstellungen tab in Phase 4.
const DEFAULT_BEITRAG_CENTS = 6969n;

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
    const userId = locals.session?.user.id;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = validateAddMember(raw);
    if (!result.success) {
      return fail(422, { action: "add", errors: result.errors, values: raw });
    }

    const db = getDb();
    const { vorname, nachname, email, eintritts_datum, role, iban } =
      result.data;

    const insertedRows = await db
      .insert(members)
      .values({
        vorname,
        nachname,
        email: email || null,
        emailCanonical: email ? email.toLowerCase().trim() : null,
        iban: iban || null,
        role,
        eintrittsDatum: eintritts_datum,
      })
      .returning({ id: members.id });

    const insertedId = insertedRows[0]?.id ?? "";

    await bus.emit("member.created", {
      memberId: insertedId,
      actorUserId: userId ?? null,
      vorname,
      nachname,
    });

    return { action: "add", success: true, memberId: insertedId };
  },

  // ── Edit member ─────────────────────────────────────────────────────────────
  edit: async ({ request, locals }) => {
    const userId = locals.session?.user.id;
    const formData = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) raw[k] = v;

    const result = validateEditMember(raw);
    if (!result.success) {
      return fail(422, { action: "edit", errors: result.errors, values: raw });
    }

    const db = getDb();
    const { id, vorname, nachname, email, eintritts_datum, role, iban } =
      result.data;

    await db
      .update(members)
      .set({
        vorname,
        nachname,
        email: email || null,
        emailCanonical: email ? email.toLowerCase().trim() : null,
        iban: iban || null,
        role,
        eintrittsDatum: eintritts_datum,
        updatedAt: new Date(),
      })
      .where(eq(members.id, id));

    await bus.emit("member.updated", {
      memberId: id,
      actorUserId: userId ?? null,
    });

    return { action: "edit", success: true };
  },

  // ── Soft-delete member ──────────────────────────────────────────────────────
  delete: async ({ request, locals }) => {
    const userId = locals.session?.user.id;
    const formData = await request.formData();
    const id = formData.get("id")?.toString() ?? "";

    if (!id)
      return fail(400, { action: "delete", error: "Fehlende Mitglieds-ID" });

    const db = getDb();
    await db
      .update(members)
      .set({
        austrittsDatum: new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
      })
      .where(eq(members.id, id));

    await bus.emit("member.deleted", {
      memberId: id,
      actorUserId: userId ?? null,
    });

    return { action: "delete", success: true };
  },

  // ── Mark Beitrag paid ───────────────────────────────────────────────────────
  "mark-beitrag-paid": async ({ request, locals }) => {
    const userId = locals.session?.user.id;
    const formData = await request.formData();
    const memberId = formData.get("member_id")?.toString() ?? "";
    const yearStr = formData.get("year")?.toString() ?? "";
    const year = parseInt(yearStr, 10);

    if (!memberId || isNaN(year)) {
      return fail(400, {
        action: "mark-beitrag-paid",
        error: "Ungültige Parameter",
      });
    }

    const db = getDb();

    // Upsert: if row exists update, if not create
    const existing = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.memberId, memberId),
          eq(memberBeitrags.year, year),
        ),
      )
      .limit(1);

    const today = new Date().toISOString().slice(0, 10);

    if (existing.length > 0 && existing[0]) {
      const row = existing[0];
      await db
        .update(memberBeitrags)
        .set({
          paidCents: row.betragCents,
          gezahltAm: today,
          updatedAt: new Date(),
        })
        .where(eq(memberBeitrags.id, row.id));
    } else {
      await db.insert(memberBeitrags).values({
        memberId,
        year,
        betragCents: DEFAULT_BEITRAG_CENTS,
        paidCents: DEFAULT_BEITRAG_CENTS,
        gezahltAm: today,
      });
    }

    await bus.emit("member.beitrag_paid", {
      memberId,
      year,
      actorUserId: userId ?? null,
    });

    return { action: "mark-beitrag-paid", success: true };
  },
};
