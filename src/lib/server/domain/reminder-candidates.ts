/**
 * Reminder-candidate loader — the single query behind the Bulk-Reminder sheet
 * AND the Mitglieder toolbar "Erinnern (N)" count (spec §5 / erinnerung-senden
 * brief §5: "EINE Server-Load, kein N+1"; the COUNT reuses the same query).
 *
 * A candidate is an ACTIVE member who owes for the year — state ∈
 * {open, partial, overdue} via the canonical `resolveBeitragState`. Paid,
 * exempt and ausgetretene members never appear (CARDINAL RULE — no false debt).
 * Non-selectable candidates (no e-mail / reminded < 30 days ago) are still
 * returned, flagged `selectable:false` + `blockedReason`, so the UI can show
 * them honestly rather than silently filtering (erinnerung-senden §1).
 *
 * The per-member `checkReminderAllowed` guard remains the authoritative gate at
 * send time (members-actions.ts); this loader is the LIST view of the same set.
 *
 * S4 #6 — no-satz-skip SYMMETRY with `matrix-loader`: both this loader and the
 * Beitragsmatrix derive per-(member, year) state from the SAME canonical
 * `resolveBeitragState`, so the missing-Beitragssatz handling is identical by
 * construction — there is no separate skip rule to keep in sync. A no-row +
 * no-satz member resolves to `betragCents=0` + `satzMissing=true` (pinned by
 * beitrag-state.test); the matrix surfaces that as the "Satz fehlt" hint and
 * this loader would list an openCents=0 candidate. In practice the Satz is
 * seeded for every reachable year (migration 0026: 2020–2027), so the zero-basis
 * edge never occurs; a resolver-level change to suppress it is deliberately
 * out-of-scope (high blast radius across matrix/list/bericht/detail). Pinned by
 * `beitrag-nosatz-symmetry.test`.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

// Client-safe types live in $lib/domain so Svelte components can import them
// without tripping the $lib/server guard; re-exported here for server callers.
export type {
  ReminderBlockedReason,
  ReminderCandidate,
  ReminderCandidatesData,
} from "$lib/domain/reminder-candidate.js";
import type {
  ReminderCandidate,
  ReminderBlockedReason,
  ReminderCandidatesData,
} from "$lib/domain/reminder-candidate.js";

/** 30-day dedup window (ADR-0005 — matches sendMail dedup + the detail load). */
export const REMINDER_DEDUP_DAYS = 30;

/** Parse settings.festgeschrieben_bis / grace-days (jsonb year int or string). */
function parseSettingInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Load the owing members for `year` with reminder eligibility. Ordered by
 * Nachname, Vorname (consistent with every other member surface).
 */
export async function loadReminderCandidates(
  year: number,
): Promise<ReminderCandidatesData> {
  const db = getDb();

  // Settings — same basis as the Matrix / Bericht so overdue detection matches.
  const settingRows = (await db.execute(sql`
    SELECT key, value FROM settings
     WHERE key IN ('festgeschrieben_bis', 'beitrag.overdue_grace_days')
  `)) as { key: string; value: unknown }[];
  let festBis: number | null = null;
  let graceDays = 60;
  for (const r of settingRows) {
    if (r.key === "festgeschrieben_bis") festBis = parseSettingInt(r.value);
    else if (r.key === "beitrag.overdue_grace_days") {
      const g = parseSettingInt(r.value);
      if (g !== null) graceDays = g;
    }
  }

  const [satz] = await db
    .select({
      cents: beitragssatzByYear.cents,
      faelligkeitAt: beitragssatzByYear.faelligkeitAt,
    })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year));
  const satzCents = satz ? Number(satz.cents) : null;
  const faelligkeit = satz?.faelligkeitAt ?? undefined;

  // Active members only — ausgetretene are never reminder candidates.
  const memberRows = await db
    .select()
    .from(members)
    .where(isNull(members.austrittsDatum))
    .orderBy(members.nachname, members.vorname);

  const ids = memberRows.map((m) => m.id);
  let beitragRows: (typeof memberBeitrags.$inferSelect)[] = [];
  if (ids.length > 0) {
    beitragRows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          inArray(memberBeitrags.memberId, ids),
          eq(memberBeitrags.year, year),
        ),
      );
  }
  const beitragByMember = new Map(beitragRows.map((b) => [b.memberId, b]));

  // First pass — keep only members who owe (open / partial / overdue).
  const owing: {
    member: (typeof memberRows)[number];
    state: "open" | "partial" | "overdue";
    openCents: number;
    betragCents: number;
  }[] = [];
  for (const m of memberRows) {
    const eintrittsJahr = m.eintrittsDatum
      ? parseInt(m.eintrittsDatum.slice(0, 4), 10)
      : 0;
    const austrittsJahr = m.austrittsDatum
      ? parseInt(m.austrittsDatum.slice(0, 4), 10)
      : null;
    const dbRow = beitragByMember.get(m.id);
    const row = dbRow
      ? {
          betragCents: Number(dbRow.betragCents),
          paidCents: Number(dbRow.paidCents),
          isExempt: dbRow.isExempt ?? false,
          gezahltAm: dbRow.gezahltAm ?? null,
        }
      : null;
    const resolved = resolveBeitragState({
      year,
      eintrittsJahr,
      austrittsJahr,
      beitragExempt: m.beitragExempt,
      row,
      satzCents,
      festBis,
      faelligkeit,
      graceDays,
    });
    if (
      resolved.state === "open" ||
      resolved.state === "partial" ||
      resolved.state === "overdue"
    ) {
      owing.push({
        member: m,
        state: resolved.state,
        openCents: Math.max(resolved.betragCents - resolved.paidCents, 0),
        betragCents: resolved.betragCents,
      });
    }
  }

  // Last beitrag_reminder per owing member (one grouped query).
  const owingIds = owing.map((o) => o.member.id);
  const lastByMember = new Map<string, string>();
  if (owingIds.length > 0) {
    const remRows = await db
      .select({
        memberId: sentMails.entityId,
        last: sql<string>`max(${sentMails.queuedAt})::text`,
      })
      .from(sentMails)
      .where(
        and(
          eq(sentMails.template, "beitrag_reminder"),
          eq(sentMails.entityKind, "member"),
          inArray(sentMails.entityId, owingIds),
        ),
      )
      .groupBy(sentMails.entityId);
    for (const r of remRows) {
      if (r.memberId) lastByMember.set(r.memberId, r.last);
    }
  }

  const cutoffMs = Date.now() - REMINDER_DEDUP_DAYS * 24 * 60 * 60 * 1000;
  const candidates: ReminderCandidate[] = owing.map(
    ({ member, state, openCents, betragCents }) => {
      const lastReminderAt = lastByMember.get(member.id) ?? null;
      const recentlyReminded =
        lastReminderAt !== null &&
        new Date(lastReminderAt).getTime() >= cutoffMs;
      let blockedReason: ReminderBlockedReason | null = null;
      if (!member.email) blockedReason = "no_email";
      else if (recentlyReminded) blockedReason = "recently_reminded";
      return {
        memberId: member.id,
        name: `${member.vorname} ${member.nachname}`.trim(),
        email: member.email ?? null,
        state,
        openCents,
        betragCents,
        lastReminderAt,
        selectable: blockedReason === null,
        blockedReason,
      };
    },
  );

  return { year, candidates };
}

/**
 * Count of SELECTABLE reminder candidates — backs the toolbar "Erinnern (N)"
 * label (shown only when > 0). Reuses `loadReminderCandidates` so the count
 * can never drift from the sheet's list (spec §5).
 */
export async function reminderCandidateCount(year: number): Promise<number> {
  const { candidates } = await loadReminderCandidates(year);
  return candidates.filter((c) => c.selectable).length;
}
