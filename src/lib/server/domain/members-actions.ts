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
import { getBeitragssatz } from "$lib/server/domain/beitragssatz.js";

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
export type MarkBeitragUnpaidResult = { ok: true } | ActionFailure;
export type SetBeitragExemptResult = { ok: true } | ActionFailure;

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

/**
 * Mark a Beitrag year as fully paid for a member.
 *
 * Refactored for Phase 1 (Task 1.6):
 * - Named-args signature (no positional args)
 * - Reads year's Beitragssatz from beitragssatz_by_year (no DEFAULT_BEITRAG_CENTS)
 * - gezahltAm is explicit — never defaulted server-side (caller passes Berlin-local date)
 * - Upserts the row: creates it if missing, updates paidCents if it exists
 *
 * ADR-0006: rejects mutations on festgeschriebene Jahre.
 * ADR-0009: admin-only.
 */
export async function markBeitragPaid(args: {
  memberId: string;
  year: number;
  gezahltAm: string;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<MarkBeitragPaidResult> {
  const { memberId, year, gezahltAm, actorUserId, actorRole } = args;

  // ADR-0009: admin-only gate.
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!memberId || !Number.isFinite(year)) {
    return { ok: false, status: 400, error: "Ungültige Parameter" };
  }

  // ADR-0006: reject if the target year is festgeschrieben.
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  // Phase 1: read Satz from beitragssatz_by_year (no hardcoded default).
  const cents = await getBeitragssatz(year);

  const db = getDb();

  // Upsert: insert a new row if none exists, update paidCents + gezahltAm if it does.
  await db
    .insert(memberBeitrags)
    .values({
      memberId,
      year,
      betragCents: cents,
      paidCents: cents,
      gezahltAm,
      source: "app",
    })
    .onConflictDoUpdate({
      target: [memberBeitrags.memberId, memberBeitrags.year],
      set: {
        paidCents: cents,
        gezahltAm,
        updatedAt: sql`now()`,
      },
    });

  await bus.emit("member.beitrag_paid", {
    memberId,
    actorUserId,
    payload: { year, gezahltAm },
  });

  return { ok: true };
}

/**
 * Reverse a Beitrag payment (storno). Sets paidCents=0 and gezahltAm=null.
 *
 * New for Phase 1 (Task 1.6). Used for corrections and the "Stornieren" button
 * in the paid-cell popover (Phase 2 UI).
 *
 * ADR-0006: rejects mutations on festgeschriebene Jahre.
 * ADR-0009: admin-only.
 */
export async function markBeitragUnpaid(args: {
  memberId: string;
  year: number;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<MarkBeitragUnpaidResult> {
  const { memberId, year, actorUserId, actorRole } = args;

  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  // ADR-0006
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  const db = getDb();

  // Fetch prev state for audit payload
  const [prev] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  if (!prev) {
    return { ok: false, status: 404, error: "Beitrag nicht gefunden." };
  }

  await db
    .update(memberBeitrags)
    .set({ paidCents: 0n, gezahltAm: null, updatedAt: sql`now()` })
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    );

  await bus.emit("member.beitrag_unpaid", {
    memberId,
    year,
    actorUserId,
    // P0-F1: convert bigint to number for JSON-safe audit payload
    prevPaidCents: Number(prev.paidCents),
    prevGezahltAm: prev.gezahltAm,
  });

  return { ok: true };
}

/**
 * Grant or revoke a per-year Befreiung from Beitragspflicht.
 *
 * New for Phase 1 (Task 1.6). Legal requirement (§55 AO): when exempt=true,
 * a non-empty reason MUST be provided — enforced at three levels:
 *   1. Server: returns 400 if reason is empty/missing
 *   2. DB: CHECK constraint on member_beitrags.exempt_reason (migration 0027)
 *   3. UI: submit button disabled until reason non-empty (Phase 2)
 *
 * ADR-0006: rejects mutations on festgeschriebene Jahre.
 * ADR-0009: admin-only.
 */
export async function setBeitragExempt(args: {
  memberId: string;
  year: number;
  exempt: boolean;
  reason?: string;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<SetBeitragExemptResult> {
  const { memberId, year, exempt, reason, actorUserId, actorRole } = args;

  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  // §55 AO: reason required when granting exemption
  if (exempt && (!reason || reason.trim() === "")) {
    return { ok: false, status: 400, error: "Grund erforderlich (§55 AO)." };
  }

  // ADR-0006
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  // Fetch Satz for the upsert's betragCents
  const cents = await getBeitragssatz(year);

  const db = getDb();

  // Fetch prev state for audit payload
  const [prev] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  const trimmedReason = exempt ? reason!.trim() : null;

  // Upsert: create row if missing, update exempt fields if it exists
  await db
    .insert(memberBeitrags)
    .values({
      memberId,
      year,
      betragCents: cents,
      paidCents: 0n,
      isExempt: exempt,
      exemptReason: trimmedReason,
      source: "app",
    })
    .onConflictDoUpdate({
      target: [memberBeitrags.memberId, memberBeitrags.year],
      set: {
        isExempt: exempt,
        exemptReason: trimmedReason,
        updatedAt: sql`now()`,
      },
    });

  await bus.emit("member.exempted", {
    memberId,
    year,
    exempt,
    reason: trimmedReason,
    prevExempt: prev?.isExempt ?? false,
    actorUserId,
  });

  return { ok: true };
}
