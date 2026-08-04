/**
 * Portal home — Summenzeile + the one-time Willkommens-Karte
 * (Aurora A-flow S2b, brief portal-onboarding-iban).
 *
 * Runs the REAL /portal/+page.server load and actions against the live DB.
 * The properties under test are the ones a member would notice if they broke:
 *  - "offen" is what the Verein still owes them (not rejected, not paid out),
 *  - the card appears exactly once and never again after ANY resolution,
 *  - "Später" resolves the card WITHOUT writing an IBAN,
 *  - an invalid IBAN writes nothing at all — including no stamp,
 *  - no response ever carries the stored IBAN in full.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { users } from "$lib/server/db/schema/users.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";

const VALID_IBAN = "DE89 3704 0044 0532 0130 00";
const VALID_IBAN_NORMALIZED = "DE89370400440532013000";

let seq = 0;

async function seedMemberWithUser(iban: string | null = null) {
  const db = getDb();
  const stamp = `${Date.now()}-${seq++}`;
  const [member] = await db
    .insert(members)
    .values({
      vorname: "Home",
      nachname: `Test${seq}`,
      email: `home-${stamp}@portal.test`,
      eintrittsDatum: "2020-01-01",
      iban,
      isFixture: true,
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `home-user-${stamp}@portal.test`,
      emailCanonical: `home-user-${stamp}@portal.test`,
      role: "member_self_service",
      memberId: member!.id,
    })
    .returning();
  return { member: member!, user: user! };
}

/**
 * Seed a submission. `erstattetAm` links a paid-out expense so the loader can
 * derive "erstattet"; `rejected` marks it decided-and-refused.
 */
async function seedSubmission(
  memberId: string,
  betragCents: number,
  opts: { erstattetAm?: string; rejected?: boolean } = {},
) {
  const db = getDb();
  const businessId = `AUS-2099-${80001 + seq++}`;
  let approvedExpenseId: string | null = null;

  if (opts.erstattetAm) {
    // expenses carries a mandatory Kategorie + its snapshots (ADR-0002); take
    // any seeded expense category rather than inventing an id.
    const [kat] = await db
      .select({
        id: kategorien.id,
        name: kategorien.name,
        sphere: kategorien.sphere,
      })
      .from(kategorien)
      .where(eq(kategorien.kind, "expense"))
      .limit(1);

    const [exp] = await db
      .insert(expenses)
      .values({
        // expenses take `A-`/`AUS-` AND the year must match year_of_buchung
        // (derived from gebucht_am = now), so this one cannot hide in 2099.
        businessId: `A-${new Date().getFullYear()}-${80001 + seq++}`,
        bezeichnung: "Erstattete Auslage",
        betragCents: BigInt(betragCents),
        rechnungsdatum: "2026-07-01",
        kategorieId: kat!.id,
        kategorieNameSnapshot: kat!.name,
        sphereSnapshot: kat!.sphere,
        bezahltVonKind: "member",
        bezahltVonMemberId: memberId,
        bezahltVonDisplay: "Mitglied: Home Test",
        belegVerzichtGrund: "Fixture ohne Beleg",
        erstattetAm: opts.erstattetAm,
      })
      .returning();
    approvedExpenseId = exp!.id;
  }

  await db.insert(auslagenSubmissions).values({
    businessId,
    bezeichnung: "Home-Test-Auslage",
    betragCents: BigInt(betragCents),
    rechnungsdatum: "2026-07-01",
    bezahltVonKind: "member",
    bezahltVonMemberId: memberId,
    bezahltVonDisplay: "Mitglied: Home Test",
    belegVerzichtGrund: "Fixture ohne Beleg",
    consentTextVersion: "test",
    decision: opts.rejected
      ? "rejected"
      : approvedExpenseId
        ? "approved"
        : null,
    decidedAt: opts.rejected || approvedExpenseId ? new Date() : null,
    approvedExpenseId,
  });
  return businessId;
}

function eventFor(userId: string, memberId: string, form?: FormData) {
  return {
    locals: {
      session: { user: { id: userId, role: "member_self_service", memberId } },
    },
    request: { formData: async () => form ?? new FormData() },
  } as never;
}

async function loadHome(userId: string, memberId: string) {
  const { load } = await import("../../src/routes/portal/+page.server.js");
  return (await load(eventFor(userId, memberId))) as unknown as {
    summen: { offenCents: number; erstattetCents: number; anzahl: number };
    showWelcome: boolean;
  };
}

async function runAction(
  name: "welcomeIban" | "welcomeDismiss",
  userId: string,
  memberId: string,
  form?: FormData,
) {
  const mod = await import("../../src/routes/portal/+page.server.js");
  return mod.actions[name]!(eventFor(userId, memberId, form));
}

async function readMemberIban(memberId: string) {
  const [row] = await getDb()
    .select({ iban: members.iban })
    .from(members)
    .where(eq(members.id, memberId));
  return row?.iban ?? null;
}

async function readWelcomeSeen(userId: string) {
  const [row] = await getDb()
    .select({ welcomeSeenAt: users.welcomeSeenAt })
    .from(users)
    .where(eq(users.id, userId));
  return row?.welcomeSeenAt ?? null;
}

describe("@phase-2 portal home — Summenzeile", () => {
  it("counts only what the Verein still owes as 'offen'", async () => {
    const { member, user } = await seedMemberWithUser();
    await seedSubmission(member.id, 2490); // open
    await seedSubmission(member.id, 1000); // open
    await seedSubmission(member.id, 5000, { erstattetAm: "2026-07-20" }); // paid
    await seedSubmission(member.id, 9999, { rejected: true }); // refused

    const { summen } = await loadHome(user.id, member.id);
    expect(summen.anzahl).toBe(4);
    // Rejected money is NOT owed, reimbursed money is no longer owed.
    expect(summen.offenCents).toBe(3490);
    expect(summen.erstattetCents).toBe(5000);
  });

  it("reports zeroes for a member without submissions", async () => {
    const { member, user } = await seedMemberWithUser();
    const { summen } = await loadHome(user.id, member.id);
    expect(summen).toEqual({ offenCents: 0, erstattetCents: 0, anzahl: 0 });
  });
});

describe("@phase-2 portal home — Willkommens-Karte", () => {
  it("shows for a fresh member and hides once resolved", async () => {
    const { member, user } = await seedMemberWithUser();
    expect((await loadHome(user.id, member.id)).showWelcome).toBe(true);

    await runAction("welcomeDismiss", user.id, member.id);

    expect((await loadHome(user.id, member.id)).showWelcome).toBe(false);
  });

  it("'Später' resolves the card WITHOUT writing an IBAN", async () => {
    const { member, user } = await seedMemberWithUser();
    await runAction("welcomeDismiss", user.id, member.id);

    expect(await readWelcomeSeen(user.id)).not.toBeNull();
    expect(await readMemberIban(member.id)).toBeNull();
  });

  it("saving an IBAN normalizes it, stamps the card, and answers MASKED", async () => {
    const { member, user } = await seedMemberWithUser();
    const form = new FormData();
    form.set("iban", VALID_IBAN);

    const result = (await runAction(
      "welcomeIban",
      user.id,
      member.id,
      form,
    )) as {
      welcomeSaved: boolean;
      maskedIban: string;
    };

    expect(result.welcomeSaved).toBe(true);
    expect(result.maskedIban).toBe("DE89 •••• 3000");
    // The stored IBAN must never travel back to the client.
    expect(JSON.stringify(result)).not.toContain(VALID_IBAN_NORMALIZED);

    expect(await readMemberIban(member.id)).toBe(VALID_IBAN_NORMALIZED);
    expect(await readWelcomeSeen(user.id)).not.toBeNull();
  });

  it("an invalid IBAN writes nothing — not the IBAN, not the stamp", async () => {
    const { member, user } = await seedMemberWithUser();
    const form = new FormData();
    form.set("iban", "DE44 5001 0517 5407 3249 9");

    const result = (await runAction(
      "welcomeIban",
      user.id,
      member.id,
      form,
    )) as {
      status: number;
      data: { welcomeError: string };
    };

    expect(result.status).toBe(422);
    expect(result.data.welcomeError).toMatch(/keine gültige IBAN/);
    expect(await readMemberIban(member.id)).toBeNull();
    // The card comes back: an error is not a decision.
    expect(await readWelcomeSeen(user.id)).toBeNull();
    expect((await loadHome(user.id, member.id)).showWelcome).toBe(true);
  });

  it("an empty IBAN is a 422, not a silent dismissal", async () => {
    const { member, user } = await seedMemberWithUser();
    const result = (await runAction(
      "welcomeIban",
      user.id,
      member.id,
      new FormData(),
    )) as { status: number };

    expect(result.status).toBe(422);
    expect(await readWelcomeSeen(user.id)).toBeNull();
  });

  it("replacing an existing IBAN keeps the card resolved and audits the change", async () => {
    const { member, user } = await seedMemberWithUser("DE12500105170648489890");
    const form = new FormData();
    form.set("iban", VALID_IBAN);

    await runAction("welcomeIban", user.id, member.id, form);

    expect(await readMemberIban(member.id)).toBe(VALID_IBAN_NORMALIZED);
    expect(await readWelcomeSeen(user.id)).not.toBeNull();
  });

  it("hands the layout a MASKED IBAN, never the stored one", async () => {
    const { member, user } = await seedMemberWithUser(VALID_IBAN_NORMALIZED);
    const { load } = await import("../../src/routes/portal/+layout.server.js");
    const result = (await load({
      locals: { session: { user: { id: user.id, memberId: member.id } } },
    } as never)) as unknown as { member: { maskedIban: string | null } };

    expect(result.member.maskedIban).toBe("DE89 •••• 3000");
    expect(JSON.stringify(result)).not.toContain(VALID_IBAN_NORMALIZED);
  });
});
