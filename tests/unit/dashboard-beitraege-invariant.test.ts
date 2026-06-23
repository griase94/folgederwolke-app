/**
 * F9 / F34 / F38 — dashboard Beiträge headline counts.
 *
 * The "X/Y bezahlt" headline on the Lage card is built from the dashboard
 * +page.server beitragsQuery. Before the fix, numerator and denominator were
 * computed over DIFFERENT member populations, so:
 *   - a member who paid then LEFT inflated paid_count past member_count → "6/5"
 *   - exempt / exited members created phantom "offen" debt.
 *
 * These DB-backed tests exercise the REAL loader SQL (no DB mock) and assert
 * the EXACT delta each seeded member contributes (not just directional
 * inequalities — review F-medium): a baseline snapshot is taken, ONE member is
 * seeded, and the precise change to every count is asserted. Year is anchored
 * via berlinYear() (ADR-0001), matching the loader's beitragsYear.
 *
 * @vitest-environment node
 * @phase-6
 */

import { describe, it, expect } from "vitest";
import {
  seedMember,
  seedPaidBeitrag,
  seedOpenBeitrag,
} from "../helpers/db-seed.js";
import { berlinYear } from "$lib/domain/year.js";

const YEAR = berlinYear();

type Beitragsuebersicht = {
  year: number;
  memberCount: number;
  paidMemberCount: number;
  paidCents: number;
  openMemberCount: number;
  offenCents: number;
  overdueCount: number;
  exemptMemberCount: number;
  lastPaymentDate: string | null;
  priorYearsUnpaidCount: number;
};

/** Invoke the real dashboard load() against the live test DB. */
async function loadBeitragsuebersicht(): Promise<Beitragsuebersicht> {
  const { load } = await import("../../src/routes/app/+page.server.js");
  const event = {
    url: new URL("http://localhost/app"),
    locals: { session: { user: { id: "u1", role: "admin" } } },
    parent: async () => ({
      festgeschriebenBis: null,
      user: { id: "u1", role: "admin" },
      availableYears: [],
      selectedYear: YEAR,
      currentYear: YEAR,
      formEnabled: false,
    }),
  };
  const result = (await load(event as never)) as unknown as {
    beitragsuebersicht: Beitragsuebersicht;
  };
  return result.beitragsuebersicht;
}

let uniq = 0;
function email() {
  return `inv-${Date.now()}-${uniq++}@test.local`;
}

describe("@phase-6 dashboard Beiträge headline counts (exact deltas)", () => {
  it("anchors the overview to the Berlin Buchungsjahr", async () => {
    const b = await loadBeitragsuebersicht();
    expect(b.year).toBe(YEAR);
  });

  it("a paid-then-left member contributes 0 to denominator AND 0 to paid (no 6/5)", async () => {
    const before = await loadBeitragsuebersicht();

    const leaver = await seedMember({
      name: "BezahlteDannAusgetreten",
      austrittsDatum: `${YEAR - 1}-12-31`, // left BEFORE this year → not liable
      email: email(),
    });
    await seedPaidBeitrag({ memberId: leaver.id, year: YEAR });

    const after = await loadBeitragsuebersicht();

    // Exact deltas: the left member is excluded everywhere.
    expect(after.memberCount).toBe(before.memberCount);
    expect(after.paidMemberCount).toBe(before.paidMemberCount);
    expect(after.exemptMemberCount).toBe(before.exemptMemberCount);
    expect(after.openMemberCount).toBe(before.openMemberCount);
    // Hard invariant holds.
    expect(after.paidMemberCount).toBeLessThanOrEqual(
      after.memberCount - after.exemptMemberCount,
    );
  });

  it("an exempt member with a stale unpaid row: +1 exempt, +1 memberCount, +0 open", async () => {
    const before = await loadBeitragsuebersicht();

    const honorary = await seedMember({
      name: "Ehrenmitglied",
      beitragExempt: true,
      beitragExemptReason: "Ehrenmitglied",
      email: email(),
    });
    await seedOpenBeitrag({ memberId: honorary.id, year: YEAR });

    const after = await loadBeitragsuebersicht();

    // member_count counts ALL liable (incl. exempt); exempt_count +1; the stale
    // unpaid row must NOT become open debt.
    expect(after.memberCount).toBe(before.memberCount + 1);
    expect(after.exemptMemberCount).toBe(before.exemptMemberCount + 1);
    expect(after.openMemberCount).toBe(before.openMemberCount);
    expect(after.offenCents).toBe(before.offenCents);
    expect(after.paidMemberCount).toBe(before.paidMemberCount);
    // The card denominator (memberCount - exemptMemberCount) is unchanged.
    expect(after.memberCount - after.exemptMemberCount).toBe(
      before.memberCount - before.exemptMemberCount,
    );
  });

  it("a member who left a prior year adds 0 to open_count/cents AND 0 to prior_years_unpaid", async () => {
    const before = await loadBeitragsuebersicht();

    const exited = await seedMember({
      name: "FrueherAusgetreten",
      austrittsDatum: `${YEAR - 2}-06-30`,
      email: email(),
    });
    // Unpaid rows in BOTH the current and a prior year — neither should count
    // since the member is no longer liable (austritts year < both).
    await seedOpenBeitrag({ memberId: exited.id, year: YEAR });
    await seedOpenBeitrag({ memberId: exited.id, year: YEAR - 1 });

    const after = await loadBeitragsuebersicht();

    expect(after.memberCount).toBe(before.memberCount);
    expect(after.openMemberCount).toBe(before.openMemberCount);
    expect(after.offenCents).toBe(before.offenCents);
    expect(after.priorYearsUnpaidCount).toBe(before.priorYearsUnpaidCount);
  });

  it("an active member with an unpaid current-year row: +1 memberCount, +1 open, +0 paid/exempt", async () => {
    const before = await loadBeitragsuebersicht();

    const active = await seedMember({ name: "AktivOffen", email: email() });
    await seedOpenBeitrag({ memberId: active.id, year: YEAR, cents: 6969n });

    const after = await loadBeitragsuebersicht();

    expect(after.memberCount).toBe(before.memberCount + 1);
    expect(after.openMemberCount).toBe(before.openMemberCount + 1);
    expect(after.offenCents).toBe(before.offenCents + 6969);
    expect(after.paidMemberCount).toBe(before.paidMemberCount);
    expect(after.exemptMemberCount).toBe(before.exemptMemberCount);
    // Invariant: paid <= liable-non-exempt.
    expect(after.paidMemberCount).toBeLessThanOrEqual(
      after.memberCount - after.exemptMemberCount,
    );
  });

  it("an active member who fully paid the current year: +1 memberCount, +1 paid, +0 open", async () => {
    const before = await loadBeitragsuebersicht();

    const payer = await seedMember({ name: "AktivBezahlt", email: email() });
    await seedPaidBeitrag({ memberId: payer.id, year: YEAR, cents: 6969n });

    const after = await loadBeitragsuebersicht();

    expect(after.memberCount).toBe(before.memberCount + 1);
    expect(after.paidMemberCount).toBe(before.paidMemberCount + 1);
    expect(after.paidCents).toBe(before.paidCents + 6969);
    expect(after.openMemberCount).toBe(before.openMemberCount);
    expect(after.paidMemberCount).toBeLessThanOrEqual(
      after.memberCount - after.exemptMemberCount,
    );
  });
});
