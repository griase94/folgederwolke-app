/**
 * Shared Mitglieder CRUD action helpers — extracted so both
 * `/app/mitglieder/+page.server.ts` (list/matrix) and
 * `/app/mitglieder/[id]/+page.server.ts` (detail) can run the same
 * write paths without duplicating code (DRY) and without 404s on
 * `?/edit` / `?/delete` from the detail route (auto-fix Phase 3 A1).
 *
 * Functions return a discriminated result tuple so the calling route
 * action can map directly onto `fail(...)` / `return { success: true }`.
 *
 * Each function:
 *   - validates input via Zod schemas in `./members.ts`
 *   - performs the write
 *   - emits the matching `member.*` event on the in-process bus
 *     (audit log is written by the registered handler — see
 *     `src/lib/server/events/handlers.ts`).
 *
 * §4.1.1 #2 (event bus for side effects), ADR-0006 (Festschreibung gate
 * for beitrag mutations).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import {
  validateAddMember,
  validateEditMember,
} from "$lib/server/domain/members.js";
import { bus } from "$lib/server/events/index.js";
import { berlinYmd } from "$lib/domain/year.js";
import { requireAdmin } from "$lib/server/domain/require-role.js";

// Default Beitrag rate in cents (69.69 €) — until Einstellungen tab in Phase 4.
const DEFAULT_BEITRAG_CENTS = 6969n;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ActionFailure = {
  ok: false;
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, unknown>;
};

export type AddMemberResult = { ok: true; memberId: string } | ActionFailure;

export type EditMemberResult = { ok: true } | ActionFailure;

export type DeleteMemberResult = { ok: true } | ActionFailure;

export type RestoreMemberResult = { ok: true } | ActionFailure;

export type MarkBeitragPaidResult = { ok: true } | ActionFailure;

// ---------------------------------------------------------------------------
// addMember
// ---------------------------------------------------------------------------

export async function addMember(
  raw: Record<string, unknown>,
  actorUserId: string | null,
  actorRole?: string | null,
): Promise<AddMemberResult> {
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  const result = validateAddMember(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const {
    vorname,
    nachname,
    email,
    eintritts_datum,
    role,
    iban,
    telefon,
    adresse,
    date_of_birth,
    beitrag_exempt,
    beitrag_exempt_reason,
  } = result.data;

  const insertedRows = await db
    .insert(members)
    .values({
      vorname,
      nachname,
      email: email || null,
      emailCanonical: email ? email.toLowerCase().trim() : null,
      iban: iban || null,
      telefon: telefon || null,
      adresse: adresse || null,
      dateOfBirth: date_of_birth || null,
      role,
      eintrittsDatum: eintritts_datum,
      // Night-2 C5-MEM-full: clear the reason if the flag is off so we
      // never persist a stale justification for a non-exempt member.
      beitragExempt: beitrag_exempt,
      beitragExemptReason: beitrag_exempt
        ? (beitrag_exempt_reason ?? null)
        : null,
    })
    .returning({ id: members.id });

  const memberId = insertedRows[0]?.id ?? "";

  await bus.emit("member.created", {
    memberId,
    actorUserId,
    payload: {
      vorname,
      nachname,
      email: email ?? null,
      role,
      beitragExempt: beitrag_exempt,
    },
  });

  return { ok: true, memberId };
}

// ---------------------------------------------------------------------------
// editMember
// ---------------------------------------------------------------------------

export async function editMember(
  raw: Record<string, unknown>,
  actorUserId: string | null,
  actorRole?: string | null,
): Promise<EditMemberResult> {
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  const result = validateEditMember(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const {
    id,
    vorname,
    nachname,
    email,
    eintritts_datum,
    role,
    iban,
    telefon,
    adresse,
    date_of_birth,
    beitrag_exempt,
    beitrag_exempt_reason,
  } = result.data;

  await db
    .update(members)
    .set({
      vorname,
      nachname,
      email: email || null,
      emailCanonical: email ? email.toLowerCase().trim() : null,
      iban: iban || null,
      telefon: telefon || null,
      adresse: adresse || null,
      dateOfBirth: date_of_birth || null,
      role,
      eintrittsDatum: eintritts_datum,
      // Night-2 C5-MEM-full: clearing the flag also clears the reason so we
      // never leave a stale justification behind on a no-longer-exempt member.
      beitragExempt: beitrag_exempt,
      beitragExemptReason: beitrag_exempt
        ? (beitrag_exempt_reason ?? null)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(members.id, id));

  await bus.emit("member.updated", {
    memberId: id,
    actorUserId,
    payload: {
      vorname,
      nachname,
      email: email ?? null,
      role,
      beitragExempt: beitrag_exempt,
    },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// softDeleteMember
// ---------------------------------------------------------------------------

export async function softDeleteMember(
  memberId: string,
  actorUserId: string | null,
  actorRole?: string | null,
): Promise<DeleteMemberResult> {
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!memberId) {
    return { ok: false, status: 400, error: "Fehlende Mitglieds-ID" };
  }

  const db = getDb();

  // C3-DISC: refuse if the member has any unpaid Beiträge — soft-deleting
  // would otherwise hide a member with open dues from the Mitglieder-Matrix
  // and lose track of money owed to the Verein. Admins must mark the year
  // paid (or zero out the dues) before archiving.
  const openRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS c
      FROM member_beitrags
     WHERE member_id = ${memberId}::uuid
       AND paid_cents < betrag_cents
  `)) as unknown as { c: number }[];
  const openCount = openRows[0]?.c ?? 0;
  if (openCount > 0) {
    return {
      ok: false,
      status: 409,
      error: `Mitglied hat ${openCount} offene Beiträge — bitte zuerst markieren oder ausgleichen.`,
    };
  }

  await db
    .update(members)
    .set({
      austrittsDatum: berlinYmd(),
      updatedAt: new Date(),
    })
    .where(eq(members.id, memberId));

  await bus.emit("member.deleted", {
    memberId,
    actorUserId,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// restoreMember — clears austrittsDatum (undoes a soft-delete). Backs the
// undo toast surfaced after softDeleteMember. C9/UX-050.
// ---------------------------------------------------------------------------

export async function restoreMember(
  memberId: string,
  actorUserId: string | null,
  actorRole?: string | null,
): Promise<RestoreMemberResult> {
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!memberId) {
    return { ok: false, status: 400, error: "Fehlende Mitglieds-ID" };
  }

  const db = getDb();
  await db
    .update(members)
    .set({ austrittsDatum: null, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  await bus.emit("member.updated", {
    memberId,
    actorUserId,
    payload: { restored: true },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// markBeitragPaid (ADR-0006: reject mutations on festgeschriebene Jahre)
// ---------------------------------------------------------------------------

/**
 * Returns the year stored under settings key `festgeschrieben_bis`, or
 * `null` if not set / not a number. Years <= this value are immutable.
 *
 * Settings.value is jsonb — Postgres drivers may parse it for us; we accept
 * either a number or a JSON-encoded numeric string.
 */
async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // Could be a JSON-encoded number ("2024") or plain "2024".
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function markBeitragPaid(
  memberId: string,
  year: number,
  actorUserId: string | null,
  actorRole?: string | null,
): Promise<MarkBeitragPaidResult> {
  // B2 fix (ADR-0009): admin-only gate.
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!memberId || !Number.isFinite(year)) {
    return { ok: false, status: 400, error: "Ungültige Parameter" };
  }

  // ADR-0006: reject if the target year is festgeschrieben.
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return {
      ok: false,
      status: 409,
      error: "Jahr ist festgeschrieben",
    };
  }

  const db = getDb();

  // Upsert: if a row exists update it; otherwise create one at the default rate.
  const existing = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  const today = berlinYmd();

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
    actorUserId,
    payload: { year, gezahltAm: today },
  });

  return { ok: true };
}
