/**
 * Beitrags-Reminder send-side helpers — the idempotency contract shared by the
 * manual single/Bulk reminder actions AND the annual cron.
 *
 * The reminder mail is deduped in `sent_mails` on
 * UNIQUE(template, entity_kind, entity_id, send_attempt) with
 * entity_kind='member' and entity_id=memberId (ADR-0005). Because entity_id
 * carries NO year, the YEAR is encoded in `send_attempt` — one dedup key per
 * (member, year). This is the single ratified strategy: cron + manual + Bulk
 * MUST compute `send_attempt` the same way, or a member could receive a
 * duplicate reminder for the same year (one per path) or a legitimate next-year
 * reminder could be silently swallowed.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { env } from "$lib/server/env.js";

/**
 * Jahresbasierter `send_attempt` (ADR-0005). MUST stay identical to the annual
 * cron (`dispatchBeitragsreminder` in cron-tasks.ts) so cron + manual + Bulk
 * share ONE sent_mails dedup key per (member, year). The 2020 base is the
 * campaign's founding year (any fixed base works; changing it would re-open
 * every already-reminded year).
 *
 * Pinned by `beitrag-reminder-send-attempt.test.ts` against the cron constant.
 */
export function reminderSendAttempt(year: number): number {
  return year - 2020;
}

/**
 * Which of `memberIds` already have a `beitrag_reminder` row for `year` (at the
 * exact jahresbasierter send_attempt key). These are the reminders that
 * `sendMail` would dedup — the emitting action buckets them as `skippedDeduped`
 * and does NOT emit, which both keeps the digest honest and makes a repeated
 * POST idempotent (the second POST sees the first POST's rows).
 *
 * One grouped query, never N+1.
 */
export async function remindedMemberIdsForYear(
  memberIds: string[],
  year: number,
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ entityId: sentMails.entityId })
    .from(sentMails)
    .where(
      and(
        eq(sentMails.template, "beitrag_reminder"),
        eq(sentMails.entityKind, "member"),
        eq(sentMails.sendAttempt, reminderSendAttempt(year)),
        inArray(sentMails.entityId, memberIds),
      ),
    );
  return new Set(
    rows.map((r) => r.entityId).filter((id): id is string => !!id),
  );
}

/**
 * The {Frist} shown in the reminder mail. An explicit `override` (the Bulk
 * sheet's chosen "Zahlbar bis" date) wins; otherwise the year's
 * Beitragssatz-Fälligkeit (`faelligkeit_at`, an ISO date string) is used, or
 * null when no Satz/Fälligkeit is configured (the intro then omits the
 * "Zahlbar bis …" clause — the sentence stays well-formed).
 */
export async function resolveReminderFrist(
  year: number,
  override?: string | null,
): Promise<string | null> {
  if (override != null && override.trim() !== "") return override;
  const db = getDb();
  const [satz] = await db
    .select({ faelligkeitAt: beitragssatzByYear.faelligkeitAt })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year));
  return satz?.faelligkeitAt ?? null;
}

/**
 * The Verein bank identity for the reminder's copy-ready transfer block —
 * exclusively from `env.VEREIN_*` (no string-literal fallbacks; a misconfigured
 * env must fail loudly, not send a wrong IBAN). Returns null when any field is
 * unset so the caller can refuse to emit with a clear 500.
 */
export function vereinBankIdentity(): {
  iban: string;
  bic: string;
  bank: string;
  empfaenger: string;
} | null {
  const iban = env.VEREIN_IBAN;
  const bic = env.VEREIN_BIC;
  const bank = env.VEREIN_BANK;
  const empfaenger = env.VEREIN_NAME;
  if (!iban || !bic || !bank || !empfaenger) return null;
  return { iban, bic, bank, empfaenger };
}
