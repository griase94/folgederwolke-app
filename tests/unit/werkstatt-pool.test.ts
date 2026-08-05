/**
 * Überweisungs-Werkstatt pool + Verwendungszweck (Aurora A-flow S3.0).
 *
 * Three ratified behaviours meet here:
 *  - F4: a claim from a CLOSED Buchungsjahr stays in the pool. It used to be
 *    filtered out and simply vanished — the money was still owed, but nobody
 *    could see it. It is now flagged instead of hidden.
 *  - M4: each claim carries the AUS-Nr of its submission and the RESOLVED
 *    payout IBAN (snapshot → extern → live member), not just extern_iban.
 *  - Abnahme #14: the Verwendungszweck the Werkstatt copies into the bank form
 *    is the same string the reimbursement mail quotes.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { listApprovedPendingErstattet } from "$lib/server/domain/transactions.js";
import { erstattungsVerwendungszweck } from "$lib/server/domain/erstattung-verwendungszweck.js";

const SNAPSHOT_IBAN = "DE89370400440532013000";
const MEMBER_LIVE_IBAN = "AT611904300234573201";

let seq = 0;
let kat: { id: string; name: string; sphere: string };

beforeAll(async () => {
  const [k] = await getDb()
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  kat = k!;
});

async function seedClaim(opts: {
  festgeschrieben?: boolean;
  memberIban?: string | null;
  snapshotIban?: string | null;
  externIban?: string | null;
}) {
  const db = getDb();
  const n = 70000 + seq++;
  let memberId: string | null = null;

  if (opts.memberIban !== undefined) {
    const [m] = await db
      .insert(members)
      .values({
        vorname: "Pool",
        nachname: `Test${n}`,
        email: `pool-${Date.now()}-${n}@portal.test`,
        eintrittsDatum: "2020-01-01",
        iban: opts.memberIban,
        isFixture: true,
      })
      .returning();
    memberId = m!.id;
  }

  const [exp] = await db
    .insert(expenses)
    .values({
      businessId: `A-${new Date().getFullYear()}-${n}`,
      bezeichnung: "Pool-Test-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      kategorieId: kat.id,
      kategorieNameSnapshot: kat.name,
      sphereSnapshot: kat.sphere as "ideeller",
      bezahltVonKind: memberId ? "member" : "extern",
      bezahltVonMemberId: memberId,
      externName: memberId ? null : "Extern Pool",
      externIban: opts.externIban ?? null,
      bezahltVonDisplay: memberId ? "Mitglied: Pool" : "Extern Pool",
      belegVerzichtGrund: "Pool-Fixture",
      approvedAt: new Date(),
      status: "geprueft",
      festgeschriebenAt: opts.festgeschrieben ? new Date() : null,
    })
    .returning();

  if (opts.snapshotIban) {
    await db.insert(auslagenSubmissions).values({
      businessId: `AUS-2099-${n}`,
      bezeichnung: "Pool-Test-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      bezahltVonKind: "member",
      bezahltVonMemberId: memberId,
      bezahltVonDisplay: "Mitglied: Pool",
      belegVerzichtGrund: "Pool-Fixture",
      consentTextVersion: "test",
      erstattungIban: opts.snapshotIban,
      approvedExpenseId: exp!.id,
    });
  }
  return {
    expenseId: exp!.id,
    ausNr: opts.snapshotIban ? `AUS-2099-${n}` : null,
  };
}

async function poolEntry(expenseId: string) {
  const pool = await listApprovedPendingErstattet();
  return pool.find((c) => c.id === expenseId);
}

describe("@phase-2 F4 — the pool no longer hides closed-year claims", () => {
  it("keeps a festgeschriebene claim in the pool and FLAGS it", async () => {
    const { expenseId } = await seedClaim({
      festgeschrieben: true,
      externIban: SNAPSHOT_IBAN,
    });

    const entry = await poolEntry(expenseId);
    // Before F4 this row was filtered out: the money was owed but invisible.
    expect(entry).toBeDefined();
    expect(entry!.festgeschrieben).toBe(true);
  });

  it("marks an open-year claim as not festgeschrieben", async () => {
    const { expenseId } = await seedClaim({ externIban: SNAPSHOT_IBAN });
    const entry = await poolEntry(expenseId);
    expect(entry!.festgeschrieben).toBe(false);
  });
});

describe("@phase-2 M4 — the pool carries AUS-Nr and the resolved payout", () => {
  it("shows the submission's AUS-Nr, not the expense number", async () => {
    const { expenseId, ausNr } = await seedClaim({
      memberIban: MEMBER_LIVE_IBAN,
      snapshotIban: SNAPSHOT_IBAN,
    });
    const entry = await poolEntry(expenseId);
    expect(entry!.ausNr).toBe(ausNr);
    expect(entry!.ausNr).not.toBe(entry!.businessId);
  });

  it("resolves the payout to the SNAPSHOT, not the live member IBAN", async () => {
    const { expenseId } = await seedClaim({
      memberIban: MEMBER_LIVE_IBAN,
      snapshotIban: SNAPSHOT_IBAN,
    });
    const entry = await poolEntry(expenseId);
    expect(entry!.payoutIban).toBe(SNAPSHOT_IBAN);
    // The live account is still reported for context, but it is NOT the target.
    expect(entry!.memberIban).toBe(MEMBER_LIVE_IBAN);
  });

  it("reports payoutIban=null for a claim nobody can pay (drives §7 + the flag)", async () => {
    const { expenseId } = await seedClaim({ memberIban: null });
    const entry = await poolEntry(expenseId);
    expect(entry!.payoutIban).toBeNull();
  });

  it("has no AUS-Nr for a directly booked expense", async () => {
    const { expenseId } = await seedClaim({ externIban: SNAPSHOT_IBAN });
    expect((await poolEntry(expenseId))!.ausNr).toBeNull();
  });
});

describe("@phase-2 Verwendungszweck — one string for bank form and mail", () => {
  it("leads with the AUS-Nr, then the Verein", () => {
    expect(
      erstattungsVerwendungszweck("AUS-2026-0071", "Folge der Wolke e.V."),
    ).toBe("Erstattung AUS-2026-0071 Folge der Wolke e.V.");
  });

  it("degrades honestly without an AUS-Nr", () => {
    expect(erstattungsVerwendungszweck(null, "Folge der Wolke e.V.")).toBe(
      "Erstattung Folge der Wolke e.V.",
    );
  });

  it("trims the Verein name, never the AUS-Nr, at the SEPA limit", () => {
    const long = "V".repeat(200);
    const out = erstattungsVerwendungszweck("AUS-2026-0071", long);
    expect(out.length).toBeLessThanOrEqual(140);
    // The only machine-matchable token must survive intact.
    expect(out).toContain("AUS-2026-0071");
  });

  it("copes with an unset Verein name", () => {
    expect(erstattungsVerwendungszweck("AUS-2026-0071", "")).toBe(
      "Erstattung AUS-2026-0071",
    );
  });
});
