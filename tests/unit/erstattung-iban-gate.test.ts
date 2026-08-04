/**
 * §7 "Keine Erstattung ohne IBAN — nie" — enforced by the SERVER (A-flow S3.0).
 *
 * The Werkstatt disables the commit button for an IBAN-less claim, but that is
 * UX only: before this guard a hand-crafted POST reached the UPDATE, flipped the
 * expense to `erstattet` and fired the ErstattungsMail for an account nobody can
 * pay into. The client is not the authority here.
 *
 * The guard resolves the payout target by the ratified M4 precedence
 * (submission snapshot → extern → live member IBAN), so a member Auslage is
 * judged by the IBAN it will ACTUALLY be paid to — not merely by
 * `expenses.extern_iban`, which is null for every member row.
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
import { zahlungsarten } from "$lib/server/db/schema/zahlungsarten.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { resolvePayoutIban } from "$lib/server/domain/erstattung-payout.js";
import { registerHandlers } from "$lib/server/events/index.js";

const SNAPSHOT_IBAN = "DE89370400440532013000";
const EXTERN_IBAN = "DE12500105170648489890";
const MEMBER_LIVE_IBAN = "AT611904300234573201";

let seq = 0;
let katId = "";
let katName = "";
let katSphere: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich" =
  "ideeller";
let zahlungsartId = "";

beforeAll(async () => {
  registerHandlers();
  const db = getDb();
  const [k] = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  katId = k!.id;
  katName = k!.name;
  katSphere = k!.sphere;
  const [z] = await db
    .select({ id: zahlungsarten.id })
    .from(zahlungsarten)
    .limit(1);
  zahlungsartId = z!.id;
});

/**
 * An APPROVED, not-yet-reimbursed expense — the state the Werkstatt commits
 * from. `payer` picks which IBAN source (if any) exists.
 */
async function seedApprovedExpense(payer: {
  kind: "member" | "extern";
  externIban?: string | null;
  memberIban?: string | null;
  snapshotIban?: string | null;
}) {
  const db = getDb();
  const n = 60000 + seq++;
  let memberId: string | null = null;

  if (payer.kind === "member") {
    const [m] = await db
      .insert(members)
      .values({
        vorname: "Gate",
        nachname: `Test${n}`,
        email: `gate-${Date.now()}-${n}@portal.test`,
        eintrittsDatum: "2020-01-01",
        iban: payer.memberIban ?? null,
        isFixture: true,
      })
      .returning();
    memberId = m!.id;
  }

  const [exp] = await db
    .insert(expenses)
    .values({
      businessId: `A-${new Date().getFullYear()}-${n}`,
      bezeichnung: "Gate-Test-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      kategorieId: katId,
      kategorieNameSnapshot: katName,
      sphereSnapshot: katSphere,
      bezahltVonKind: payer.kind,
      bezahltVonMemberId: memberId,
      externName: payer.kind === "extern" ? "Extern Tester" : null,
      externIban: payer.externIban ?? null,
      bezahltVonDisplay:
        payer.kind === "member" ? "Mitglied: Gate" : "Extern Tester",
      belegVerzichtGrund: "Gate-Fixture",
      approvedAt: new Date(),
      status: "geprueft",
    })
    .returning();

  if (payer.snapshotIban !== undefined && payer.snapshotIban !== null) {
    await db.insert(auslagenSubmissions).values({
      businessId: `AUS-2099-${n}`,
      bezeichnung: "Gate-Test-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      bezahltVonKind: "member",
      bezahltVonMemberId: memberId,
      bezahltVonDisplay: "Mitglied: Gate",
      belegVerzichtGrund: "Gate-Fixture",
      consentTextVersion: "test",
      erstattungIban: payer.snapshotIban,
      approvedExpenseId: exp!.id,
    });
  }

  return { expenseId: exp!.id, memberId };
}

async function readExpense(id: string) {
  const [row] = await getDb()
    .select({ erstattetAm: expenses.erstattetAm, status: expenses.status })
    .from(expenses)
    .where(eq(expenses.id, id));
  return row!;
}

async function countMails() {
  const rows = await getDb().select({ id: sentMails.id }).from(sentMails);
  return rows.length;
}

describe("@phase-2 §7 — the server refuses a reimbursement without an IBAN", () => {
  it("rejects a member expense whose member has no IBAN, and changes NOTHING", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "member",
      memberIban: null,
    });
    const mailsBefore = await countMails();

    const res = await markExpenseErstattet({
      expenseId,
      chosenDate: "2026-07-20",
      zahlungsartId,
      actorUserId: null as unknown as string,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(422);
      expect(res.error).toMatch(/IBAN/);
    }
    // The row is untouched and no mail went out for an unpayable account.
    const row = await readExpense(expenseId);
    expect(row.erstattetAm).toBeNull();
    expect(row.status).not.toBe("erstattet");
    expect(await countMails()).toBe(mailsBefore);
  });

  it("rejects an extern expense without an IBAN", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "extern",
      externIban: null,
    });

    const res = await markExpenseErstattet({
      expenseId,
      chosenDate: "2026-07-20",
      zahlungsartId,
      actorUserId: null as unknown as string,
    });

    expect(res.ok).toBe(false);
    expect((await readExpense(expenseId)).erstattetAm).toBeNull();
  });

  it("allows the commit once an IBAN exists (guard is not a blanket block)", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "extern",
      externIban: EXTERN_IBAN,
    });

    const res = await markExpenseErstattet({
      expenseId,
      chosenDate: "2026-07-20",
      zahlungsartId,
      actorUserId: null as unknown as string,
    });

    expect(res.ok).toBe(true);
    expect((await readExpense(expenseId)).erstattetAm).toBe("2026-07-20");
  });
  it("does NOT demand an IBAN for a Verein-direct expense", async () => {
    // The Verein paid the vendor itself — there is no payee to reimburse and
    // no IBAN to hold. Applying §7 here would make every Verein-direct
    // expense unpayable, which is the regression this pins.
    const db = getDb();
    const n = 60000 + seq++;
    const [exp] = await db
      .insert(expenses)
      .values({
        businessId: `A-${new Date().getFullYear()}-${n}`,
        bezeichnung: "Verein zahlt den Lieferanten direkt",
        betragCents: 4200n,
        rechnungsdatum: "2026-07-01",
        kategorieId: katId,
        kategorieNameSnapshot: katName,
        sphereSnapshot: katSphere,
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Folge der Wolke e.V.",
        belegVerzichtGrund: "Gate-Fixture",
        approvedAt: new Date(),
        status: "geprueft",
      })
      .returning();

    const res = await markExpenseErstattet({
      expenseId: exp!.id,
      chosenDate: "2026-07-20",
      zahlungsartId,
      actorUserId: null as unknown as string,
    });

    expect(res.ok).toBe(true);
    expect((await readExpense(exp!.id)).erstattetAm).toBe("2026-07-20");
  });
});

describe("@phase-2 M4 — payout precedence: snapshot → extern → live member", () => {
  it("prefers the submission SNAPSHOT over everything else", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "member",
      memberIban: MEMBER_LIVE_IBAN,
      snapshotIban: SNAPSHOT_IBAN,
    });
    const payout = await resolvePayoutIban(expenseId);
    // The money goes where it was promised at submit time — a later profile
    // edit must not silently redirect it.
    expect(payout).toEqual({ iban: SNAPSHOT_IBAN, source: "snapshot" });
  });

  it("uses extern_iban for the extern arm", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "extern",
      externIban: EXTERN_IBAN,
    });
    expect(await resolvePayoutIban(expenseId)).toEqual({
      iban: EXTERN_IBAN,
      source: "extern",
    });
  });

  it("falls back to the LIVE member IBAN when there is no snapshot (pre-S2b rows)", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "member",
      memberIban: MEMBER_LIVE_IBAN,
    });
    // Ratified 28.07: for a submission that predates the snapshot, the member's
    // current account is the only sensible truth (bank change wins).
    expect(await resolvePayoutIban(expenseId)).toEqual({
      iban: MEMBER_LIVE_IBAN,
      source: "member-live",
    });
  });

  it("reports no target when nothing is on file", async () => {
    const { expenseId } = await seedApprovedExpense({
      kind: "member",
      memberIban: null,
    });
    expect(await resolvePayoutIban(expenseId)).toEqual({
      iban: null,
      source: null,
    });
  });

  it("stays single-valued even if TWO submissions link the same expense", async () => {
    // approved_expense_id has an FK but NO unique constraint, so the schema
    // permits this. In the Werkstatt pool a row-multiplying JOIN would show the
    // amount twice — money double-counted on screen.
    const { expenseId, memberId } = await seedApprovedExpense({
      kind: "member",
      memberIban: MEMBER_LIVE_IBAN,
      snapshotIban: SNAPSHOT_IBAN,
    });
    const n = 60000 + seq++;
    await getDb()
      .insert(auslagenSubmissions)
      .values({
        businessId: `AUS-2099-${n}`,
        bezeichnung: "Zweite Submission auf dieselbe Expense",
        betragCents: 2490n,
        rechnungsdatum: "2026-07-01",
        bezahltVonKind: "member",
        bezahltVonMemberId: memberId,
        bezahltVonDisplay: "Mitglied: Gate",
        belegVerzichtGrund: "Gate-Fixture",
        consentTextVersion: "test",
        erstattungIban: EXTERN_IBAN,
        approvedExpenseId: expenseId,
      });

    const payout = await resolvePayoutIban(expenseId);
    // Deterministic by business_id — one answer, never two rows.
    expect(payout.source).toBe("snapshot");
    expect([SNAPSHOT_IBAN, EXTERN_IBAN]).toContain(payout.iban);
  });
});
