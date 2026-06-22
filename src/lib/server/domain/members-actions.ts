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
import { berlinYmd, currentBuchungsjahr } from "$lib/domain/year.js";
import { requireAdmin } from "$lib/server/domain/require-role.js";
import { findBeitragssatz } from "$lib/server/domain/beitragssatz.js";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * F8 — future-Buchungsjahr write guard message. A Beitrag (paid or befreit)
 * for a year that hasn't begun would book cash/exemption into a future fiscal
 * year. Enforced at the write boundary; the matrix UI also clamps its default
 * window so the future column isn't even reachable in the common case.
 */
export const FUTURE_YEAR_ERROR =
  "Beiträge für zukünftige Jahre können noch nicht erfasst werden.";

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

/**
 * Missing-Beitragssatz failure (422). Surfaced when an admin tries to mark a
 * year paid / befreit before any Satz is configured for that year — e.g. a
 * future year the matrix/MemberCardMobile can reach. Returning a friendly
 * 422 instead of letting `getBeitragssatz` throw avoids the opaque 500 the
 * treasurer would otherwise hit (members-actions findings).
 */
function noBeitragssatzFailure(year: number): ActionFailure {
  return {
    ok: false,
    status: 422,
    error: `Für ${year} ist kein Beitragssatz hinterlegt — bitte zuerst unter Einstellungen festlegen.`,
  };
}

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
 * Mark a Beitrag year as paid (full or partial) for a member.
 *
 * Refactored for Package B (member-zahlung redesign):
 * - Accepts optional `paidCents` (integer cents) — if omitted, pays the full
 *   recorded obligation (betragCents). Clamped to [0, betragCents].
 * - Accepts optional `notes` (free text, stored on the row).
 * - `betragCents` resolution order (NEVER clobber on update):
 *     1. Existing row's betragCents (preserve recorded amount).
 *     2. Current Satz from beitragssatz_by_year (for new rows only).
 *     3. No Satz found → friendly 422.
 *
 * ADR-0006: rejects mutations on festgeschriebene Jahre.
 * ADR-0009: admin-only.
 */
export async function markBeitragPaid(args: {
  memberId: string;
  year: number;
  gezahltAm: string;
  /** Optional partial amount in integer cents. Omit to pay the full obligation. */
  paidCents?: number;
  /** Optional free-text note stored on the member_beitrags row. */
  notes?: string | null;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<MarkBeitragPaidResult> {
  const {
    memberId,
    year,
    gezahltAm,
    paidCents,
    notes,
    actorUserId,
    actorRole,
  } = args;

  // ADR-0009: admin-only gate.
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!memberId || !Number.isFinite(year)) {
    return { ok: false, status: 400, error: "Ungültige Parameter" };
  }

  // F8: reject future Buchungsjahre. Recording cash into a year that hasn't
  // begun books income into a future fiscal year (and the matrix used to let
  // 2027 be marked paid in 2026). Upper bound is the Berlin Buchungsjahr
  // (ADR-0001).
  if (year > currentBuchungsjahr()) {
    return { ok: false, status: 422, error: FUTURE_YEAR_ERROR };
  }

  // ADR-0006: reject if the target year is festgeschrieben.
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  const db = getDb();

  // Fetch existing row — betragCents from an existing row MUST be preserved.
  const [existingRow] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  // Resolve the obligation amount:
  //   - Existing row → use its betragCents (no clobber).
  //   - No row → look up current Satz (config gap → friendly 422).
  let betragCentsForInsert: bigint;
  let betragCentsForClamp: bigint;

  if (existingRow) {
    betragCentsForInsert = existingRow.betragCents;
    betragCentsForClamp = existingRow.betragCents;
  } else {
    const satz = await findBeitragssatz(year);
    if (satz === null) {
      return noBeitragssatzFailure(year);
    }
    betragCentsForInsert = satz;
    betragCentsForClamp = satz;
  }

  // Compute effectivePaid: clamp caller-supplied paidCents to [0, betragCents].
  // If paidCents is omitted, pay the full obligation.
  const rawPaid =
    paidCents !== undefined ? BigInt(paidCents) : betragCentsForClamp;
  const effectivePaid =
    rawPaid < 0n
      ? 0n
      : rawPaid > betragCentsForClamp
        ? betragCentsForClamp
        : rawPaid;

  const notesValue = notes ?? null;

  if (existingRow) {
    // Update existing row: set paidCents + gezahltAm + notes.
    // NEVER touch betragCents (no clobber invariant).
    await db
      .update(memberBeitrags)
      .set({
        paidCents: effectivePaid,
        gezahltAm,
        notes: notesValue,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(memberBeitrags.memberId, memberId),
          eq(memberBeitrags.year, year),
        ),
      );
  } else {
    // Insert new row with Satz as betragCents.
    await db.insert(memberBeitrags).values({
      memberId,
      year,
      betragCents: betragCentsForInsert,
      paidCents: effectivePaid,
      gezahltAm,
      notes: notesValue,
      source: "app",
    });
  }

  await bus.emit("member.beitrag_paid", {
    memberId,
    actorUserId,
    payload: { year, gezahltAm, paidCents: Number(effectivePaid) },
  });

  return { ok: true };
}

export type MarkBeitragPaidBulkResult =
  | {
      ok: true;
      paidCount: number;
      skipped: { memberId: string; error: string }[];
    }
  | ActionFailure;

/**
 * Mark a single year as paid for many members in one go (Mitglieder bulk
 * "Als bezahlt markieren"). Each member runs through the same `markBeitragPaid`
 * path — so every row gets the festschreibung gate, the Satz lookup, the
 * betragCents-preserving upsert, and an audit event — and per-member failures
 * (e.g. a festgeschriebenes Jahr, a missing Satz) are collected rather than
 * aborting the whole batch. The admin gate runs ONCE up front.
 *
 * NOTE: this is intentionally a sequence of per-member atomic upserts, not one
 * wrapping DB transaction, because each `markBeitragPaid` emits its own audit
 * event on success (ADR-0004 append-only) — a partial batch leaves a correct,
 * per-member-consistent trail rather than silently rolling audit rows back.
 */
export async function markBeitragPaidBulk(args: {
  memberIds: string[];
  year: number;
  gezahltAm: string;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<MarkBeitragPaidBulkResult> {
  const { memberIds, year, gezahltAm, actorUserId, actorRole } = args;

  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!Number.isFinite(year)) {
    return { ok: false, status: 400, error: "Ungültige Parameter" };
  }
  // De-dupe + drop empties so a malformed payload can't double-post a member.
  const ids = [...new Set(memberIds.filter((id) => id && id.trim() !== ""))];
  if (ids.length === 0) {
    return { ok: false, status: 400, error: "Keine Mitglieder ausgewählt." };
  }

  let paidCount = 0;
  const skipped: { memberId: string; error: string }[] = [];

  for (const memberId of ids) {
    const result = await markBeitragPaid({
      memberId,
      year,
      gezahltAm,
      actorUserId,
      actorRole,
    });
    if (result.ok) {
      paidCount += 1;
    } else {
      skipped.push({ memberId, error: result.error ?? "Fehler" });
    }
  }

  return { ok: true, paidCount, skipped };
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

  // F8: reject future Buchungsjahre (symmetry with markBeitragPaid).
  if (year > currentBuchungsjahr()) {
    return { ok: false, status: 422, error: FUTURE_YEAR_ERROR };
  }

  // ADR-0006
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  const db = getDb();

  // Fetch prev state for audit payload + to decide whether we even need a Satz.
  const [prev] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  // The Satz is only needed to seed betragCents on a brand-new row. When a row
  // already exists we update its exempt flags WITHOUT touching betragCents, so
  // exempting an existing row never depends on a configured Satz. Only require
  // (and 422 on) a missing Satz when we'd have to INSERT.
  let insertBetragCents = 0n;
  if (!prev) {
    const cents = await findBeitragssatz(year);
    if (cents === null) {
      return noBeitragssatzFailure(year);
    }
    insertBetragCents = cents;
  }

  const trimmedReason = exempt ? reason!.trim() : null;

  // Upsert: create row if missing, update exempt fields if it exists. On
  // conflict betragCents is intentionally left untouched (preserve a prior
  // recorded amount — same invariant as markBeitragPaid).
  await db
    .insert(memberBeitrags)
    .values({
      memberId,
      year,
      betragCents: insertBetragCents,
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

// ---------------------------------------------------------------------------
// checkReminderAllowed — false-debt guard for ?/send-reminder (both routes)
// ---------------------------------------------------------------------------

/**
 * Result type for the false-debt reminder guard.
 * Routes call this before sending mail: if allowed=false, fail(status, error).
 */
export type CheckReminderAllowedResult =
  | { allowed: true; member: typeof members.$inferSelect; betragCents: number }
  | { allowed: false; status: number; error: string };

/**
 * CARDINAL RULE: no surface may assert a debt that doesn't exist.
 *
 * Resolves the canonical beitrag state for (memberId, year) and refuses
 * with 422 when the member owes nothing:
 *   - not_applicable_pre_join / not_applicable_post_austritt / permanently_exempt / exempt → 422
 *   - paid (paidCents >= betragCents) → 422
 *   - open / partial / overdue → allowed (reminder is appropriate)
 *   - member not found → 404
 *
 * Replaces the previous VEREIN_BEITRAG_DEFAULT_CENTS fabrication that invented
 * a debt for settled years. The default Satz is still used to derive betragCents
 * for genuinely-open no-row years — it is ONLY removed from the path that
 * constructs a reminder for an already-paid year.
 *
 * Package B — member-zahlung redesign.
 */
export async function checkReminderAllowed(args: {
  memberId: string;
  year: number;
}): Promise<CheckReminderAllowedResult> {
  const { memberId, year } = args;
  const db = getDb();

  // Fetch member
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);

  if (!member) {
    return { allowed: false, status: 404, error: "Mitglied nicht gefunden" };
  }

  // Fetch beitrag row (may be null for no-row members)
  const [beitragRow] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    )
    .limit(1);

  // Fetch satz for this year (may be null — no-satz no-row is open with hint)
  const satzBigint = await findBeitragssatz(year);
  const satzCents = satzBigint !== null ? Number(satzBigint) : null;

  // Parse eintrittsJahr + austrittsJahr from stored date strings (YYYY-MM-DD)
  const eintrittsJahr = parseInt(
    (member.eintrittsDatum ?? `${year}-01-01`).slice(0, 4),
    10,
  );
  const austrittsJahr =
    member.austrittsDatum != null
      ? parseInt(member.austrittsDatum.slice(0, 4), 10)
      : null;

  // Fetch festgeschrieben_bis for the resolver
  const festBis = await fetchFestgeschriebenBis();

  // Build the BeitragRow shape for the resolver
  const row = beitragRow
    ? {
        betragCents: Number(beitragRow.betragCents),
        paidCents: Number(beitragRow.paidCents),
        isExempt: beitragRow.isExempt ?? false,
        gezahltAm: beitragRow.gezahltAm ?? null,
      }
    : null;

  const resolved = resolveBeitragState({
    year,
    eintrittsJahr,
    austrittsJahr,
    beitragExempt: member.beitragExempt ?? false,
    row,
    satzCents,
    festBis,
  });

  // States that mean "owes nothing" → refuse the reminder
  const owesNothing = (
    [
      "paid",
      "permanently_exempt",
      "exempt",
      "not_applicable_pre_join",
      "not_applicable_post_austritt",
    ] as const
  ).includes(
    resolved.state as
      | "paid"
      | "permanently_exempt"
      | "exempt"
      | "not_applicable_pre_join"
      | "not_applicable_post_austritt",
  );

  if (owesNothing) {
    const stateMessages: Record<string, string> = {
      paid: `Mitglied hat den Beitrag ${year} bereits bezahlt`,
      permanently_exempt:
        "Mitglied ist dauerhaft von der Beitragspflicht befreit",
      exempt: `Mitglied ist für ${year} von der Beitragspflicht befreit`,
      not_applicable_pre_join: `Mitglied war ${year} noch nicht im Verein`,
      not_applicable_post_austritt: `Mitglied ist ${year} bereits ausgetreten`,
    };
    return {
      allowed: false,
      status: 422,
      error:
        stateMessages[resolved.state] ??
        "Mitglied schuldet für dieses Jahr nichts",
    };
  }

  return {
    allowed: true,
    member,
    betragCents: resolved.betragCents,
  };
}
