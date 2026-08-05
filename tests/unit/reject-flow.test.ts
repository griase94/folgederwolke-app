/**
 * The reject path end to end at the domain layer (A-S3.3).
 *
 * The modal disables "Ablehnen" below three characters, but that is UX: a
 * hand-crafted POST must hit the same wall server-side, and a rejection that
 * fails validation must leave the submission decidable. The mail side is pinned
 * here too — one mail per rejection, the treasurer's wording carried verbatim,
 * and the submission's OWN date threaded through for the fact block (the mail
 * dates the submission, not the decision).
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { users } from "$lib/server/db/schema/users.js";
import { rejectSubmission } from "$lib/server/domain/audit-inbox-actions.js";
import { bus, registerHandlers } from "$lib/server/events/index.js";
import type { EventPayload } from "$lib/server/events/types.js";

const GRUND =
  "Der Beleg war leider nicht lesbar — bitte mach ein schärferes Foto.";

let seq = 0;
/** A decision always has an actor — decided_by_user_id is a real FK. */
let actorUserId = "";

beforeAll(async () => {
  registerHandlers();
  const email = `reject-actor-${Date.now()}@test.invalid`;
  const [u] = await getDb()
    .insert(users)
    .values({ email, emailCanonical: email, name: "Reject Actor" })
    .returning();
  actorUserId = u!.id;
});

/** A pending submission from a member who can actually receive mail. */
async function seedPending(submittedAt: Date) {
  const db = getDb();
  const n = 70000 + seq++;
  const [m] = await db
    .insert(members)
    .values({
      vorname: "Reject",
      nachname: `Test${n}`,
      email: `reject-${Date.now()}-${n}@portal.test`,
      eintrittsDatum: "2020-01-01",
      isFixture: true,
    })
    .returning();
  const [s] = await db
    .insert(auslagenSubmissions)
    .values({
      businessId: `AUS-2098-${n}`,
      bezeichnung: "Reject-Test-Auslage",
      betragCents: 7230n,
      rechnungsdatum: "2026-07-01",
      bezahltVonKind: "member",
      bezahltVonMemberId: m!.id,
      bezahltVonDisplay: "Mitglied: Reject",
      belegVerzichtGrund: "Reject-Fixture",
      consentTextVersion: "test",
      submittedAt,
    })
    .returning();
  return { submissionId: s!.id, businessId: s!.businessId };
}

async function readSubmission(id: string) {
  const [row] = await getDb()
    .select({
      decision: auslagenSubmissions.decision,
      decidedAt: auslagenSubmissions.decidedAt,
      decisionReason: auslagenSubmissions.decisionReason,
    })
    .from(auslagenSubmissions)
    .where(eq(auslagenSubmissions.id, id));
  return row!;
}

async function mailsFor(submissionId: string) {
  return getDb()
    .select({ subject: sentMails.subject, template: sentMails.template })
    .from(sentMails)
    .where(eq(sentMails.entityId, submissionId));
}

describe("@phase-2 rejectSubmission — the 3-character floor is the server's", () => {
  it("refuses a too-short reason and leaves the submission decidable", async () => {
    const { submissionId } = await seedPending(
      new Date("2026-07-08T09:30:00Z"),
    );

    const res = await rejectSubmission({
      submissionId,
      actorUserId,
      grund: "ab",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(422);
    const row = await readSubmission(submissionId);
    expect(row.decision).toBeNull();
    expect(row.decidedAt).toBeNull();
    expect(await mailsFor(submissionId)).toHaveLength(0);
  });

  it("refuses whitespace padded to length — trim, not length()", async () => {
    const { submissionId } = await seedPending(
      new Date("2026-07-08T09:30:00Z"),
    );
    const res = await rejectSubmission({
      submissionId,
      actorUserId,
      grund: "      ",
    });
    expect(res.ok).toBe(false);
    expect((await readSubmission(submissionId)).decision).toBeNull();
  });
});

describe("@phase-2 rejectSubmission — decision, mail, idempotency", () => {
  it("stores the reason verbatim and sends exactly one mail with the new subject", async () => {
    const { submissionId, businessId } = await seedPending(
      new Date("2026-07-08T09:30:00Z"),
    );

    const res = await rejectSubmission({
      submissionId,
      actorUserId,
      grund: GRUND,
    });
    expect(res).toMatchObject({ ok: true, alreadyDecided: false });

    const row = await readSubmission(submissionId);
    expect(row.decision).toBe("rejected");
    // Verbatim: this exact string is what the member reads in the Grund-Box.
    expect(row.decisionReason).toBe(GRUND);

    const mails = await mailsFor(submissionId);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.template).toBe("auslage_abgelehnt");
    expect(mails[0]!.subject).toBe(
      `Kurz zu deiner Auslage ${businessId} — so klappt's mit der Erstattung`,
    );
  });

  it("treats a second reject as already-decided and sends no second mail", async () => {
    const { submissionId } = await seedPending(
      new Date("2026-07-08T09:30:00Z"),
    );
    await rejectSubmission({ submissionId, actorUserId, grund: GRUND });
    const second = await rejectSubmission({
      submissionId,
      actorUserId,
      grund: "Ein ganz anderer Grund.",
    });

    expect(second).toMatchObject({ ok: true, alreadyDecided: true });
    expect(await mailsFor(submissionId)).toHaveLength(1);
    // The first decision stands — a late second call must not rewrite it.
    expect((await readSubmission(submissionId)).decisionReason).toBe(GRUND);
  });

  it("threads the SUBMISSION date to the mail, not the decision date", async () => {
    const submittedAt = new Date("2026-07-08T09:30:00Z");
    const { submissionId } = await seedPending(submittedAt);

    let seen: EventPayload<"auslage.rejected"> | null = null;
    bus.on<EventPayload<"auslage.rejected">>("auslage.rejected", async (p) => {
      if (p.submissionId === submissionId) seen = p;
    });

    await rejectSubmission({ submissionId, actorUserId, grund: GRUND });

    expect(seen).not.toBeNull();
    const payload = seen as unknown as EventPayload<"auslage.rejected">;
    expect(payload.eingereichtAm.toISOString()).toBe(submittedAt.toISOString());
    expect(payload.grund).toBe(GRUND);
  });
});
