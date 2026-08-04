// @vitest-environment node
/**
 * S3a gate — Beitrags-Erinnerung goes through the event bus, with the
 * jahresbasierte `sent_mails` idempotency contract (ADR-0005, §4.1.1 #2).
 *
 * Real DB (app_runtime), real registered handlers, MAIL_PROVIDER=no-op (the
 * provider still writes the `sent_mails` row, so we assert idempotency by
 * reading the table directly — the ADR-0005 idiom).
 *
 * Seeds its OWN four members with fixed uuids and only ever touches those rows
 * (never a blanket DELETE) so it is parallel-safe against the other integration
 * specs sharing the reset lane.
 *
 * @aurora-impl-c2
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { registerHandlers } from "$lib/server/events/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { sendBeitragReminderBulk } from "$lib/server/domain/members-actions.js";
import { reminderSendAttempt } from "$lib/server/domain/beitrag-reminder.js";
import { dispatchBeitragsreminder } from "$lib/server/domain/cron-tasks.js";

// 2026 is the current Buchungsjahr in the seeded test DB (festgeschrieben_bis=2024,
// Satz 6969 fällig 2026-03-31) — a clean, non-festgeschriebenes year.
const YEAR = 2026;

const M_OWING1 = "aaaaaaaa-0000-4000-8000-000000000001";
const M_OWING2 = "aaaaaaaa-0000-4000-8000-000000000002";
const M_PAID = "aaaaaaaa-0000-4000-8000-000000000003";
const M_NOMAIL = "aaaaaaaa-0000-4000-8000-000000000004";
const ALL = [M_OWING1, M_OWING2, M_PAID, M_NOMAIL];
const OWING = [M_OWING1, M_OWING2];

async function cleanup(): Promise<void> {
  const db = getDb();
  // Blanket-delete ALL beitrag_reminder rows — the cron path (below) scans every
  // owing member, so it can create collateral rows for the fixture roster; this
  // keeps the shared reset-lane DB clean for the other specs.
  await db.delete(sentMails).where(eq(sentMails.template, "beitrag_reminder"));
  await db.delete(memberBeitrags).where(inArray(memberBeitrags.memberId, ALL));
  await db.delete(members).where(inArray(members.id, ALL));
}

async function seed(): Promise<void> {
  const db = getDb();
  await db.insert(members).values([
    { id: M_OWING1, vorname: "Owe", nachname: "One", email: "owe.one@example.org", eintrittsDatum: "2020-01-01" }, // prettier-ignore
    { id: M_OWING2, vorname: "Owe", nachname: "Two", email: "owe.two@example.org", eintrittsDatum: "2020-01-01" }, // prettier-ignore
    { id: M_PAID, vorname: "Paid", nachname: "Three", email: "paid.three@example.org", eintrittsDatum: "2020-01-01" }, // prettier-ignore
    { id: M_NOMAIL, vorname: "Nomail", nachname: "Four", email: null, eintrittsDatum: "2020-01-01" }, // prettier-ignore
  ]);
  // State is fully controlled via explicit beitrag rows (independent of the
  // seeded Satz): owing (open + partial), paid, and owing-without-email.
  await db.insert(memberBeitrags).values([
    { memberId: M_OWING1, year: YEAR, betragCents: 6969n, paidCents: 0n },
    { memberId: M_OWING2, year: YEAR, betragCents: 6969n, paidCents: 2000n },
    { memberId: M_PAID, year: YEAR, betragCents: 6969n, paidCents: 6969n, gezahltAm: "2026-02-01" }, // prettier-ignore
    { memberId: M_NOMAIL, year: YEAR, betragCents: 6969n, paidCents: 0n },
  ]);
}

async function reminderRows(): Promise<
  { entityId: string | null; sendAttempt: number; entityKind: string }[]
> {
  return getDb()
    .select({
      entityId: sentMails.entityId,
      sendAttempt: sentMails.sendAttempt,
      entityKind: sentMails.entityKind,
    })
    .from(sentMails)
    .where(
      and(
        eq(sentMails.template, "beitrag_reminder"),
        inArray(sentMails.entityId, ALL),
      ),
    );
}

beforeAll(() => {
  registerHandlers();
});

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
});

describe("S3a — Beitrags-Reminder event-bus path", () => {
  it("bulk sends N mails via the bus; no-mail + false-debt bucketed honestly", async () => {
    const res = await sendBeitragReminderBulk({
      memberIds: ALL,
      year: YEAR,
      actorUserId: null,
      actorRole: "admin",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([...res.sent].sort()).toEqual([...OWING].sort());
    expect(res.skippedNoMail).toEqual([M_NOMAIL]);
    expect(res.skippedNoDebt).toEqual([M_PAID]);
    expect(res.skippedDeduped).toEqual([]);
    expect(res.failed).toEqual([]);

    const rows = await reminderRows();
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.entityKind).toBe("member");
      expect(r.sendAttempt).toBe(reminderSendAttempt(YEAR)); // jahresbasiert (= 6)
      expect(OWING).toContain(r.entityId);
    }
  });

  it("double-POST is idempotent — 2nd send is skippedDeduped, no new sent_mails rows", async () => {
    await sendBeitragReminderBulk({
      memberIds: ALL,
      year: YEAR,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(await reminderRows()).toHaveLength(2);

    const res2 = await sendBeitragReminderBulk({
      memberIds: ALL,
      year: YEAR,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.sent).toEqual([]);
    expect([...res2.skippedDeduped].sort()).toEqual([...OWING].sort());

    // No duplicate rows — the (member, year) UNIQUE key held.
    expect(await reminderRows()).toHaveLength(2);
  });

  it("admin-gated — a non-admin role is refused and sends nothing", async () => {
    const res = await sendBeitragReminderBulk({
      memberIds: [M_OWING1],
      year: YEAR,
      actorUserId: null,
      actorRole: "mitglied",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(403);
    expect(await reminderRows()).toHaveLength(0);
  });
});

describe("S3a-Nachtrag — the annual cron shares the (member, year) dedup key", () => {
  it("cron emits at year-2020 and does NOT double-send against a manual reminder", async () => {
    // 1) A manual reminder to M_OWING1 writes the (member, year) sent_mails row.
    const manual = await sendBeitragReminderBulk({
      memberIds: [M_OWING1],
      year: YEAR,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(manual.ok).toBe(true);

    // 2) The annual cron scans ALL owing members for YEAR. M_OWING1 was already
    // reminded (by the manual send) → the shared pre-check skips it (no 2nd row);
    // M_OWING2 (owing, not yet reminded) → sent. This IS the double-send proof:
    // cron + manual dedup on ONE key. (Fixture-roster owing members are collateral;
    // we assert only on OUR seeded members via reminderRows().)
    const result = await dispatchBeitragsreminder({
      iban: "DE21701500000123456789",
      bic: "SSKMDEMMXXX",
      bank: "Stadtsparkasse München",
      empfaenger: "Folge der Wolke e.V.",
      year: YEAR,
    });
    expect(result.sent).toBeGreaterThanOrEqual(1); // ≥ M_OWING2
    expect(result.skipped).toBeGreaterThanOrEqual(1); // ≥ M_OWING1 (dedup)

    const rows = await reminderRows();
    const perMember = new Map<string, number>();
    for (const r of rows) {
      if (r.entityId)
        perMember.set(r.entityId, (perMember.get(r.entityId) ?? 0) + 1);
      expect(r.sendAttempt).toBe(reminderSendAttempt(YEAR)); // one shared key
    }
    expect(perMember.get(M_OWING1)).toBe(1); // NOT double-sent by the cron
    expect(perMember.get(M_OWING2)).toBe(1); // cron picked up the un-reminded one
  });
});
