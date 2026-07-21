/**
 * @vitest-environment node
 * @phase-aurora-slice4
 *
 * Aurora slice 4 — loader triplet semantics (spec §7 "Stand" strip).
 *
 * Triplet contract: Einnahmen = income table + paid Mitgliedsbeiträge
 * (EXCLUDING Spenden), Spenden separate, and the triplet reconciles with the
 * hero Saldo: einnahmenExclSpendenYtdCents + spendenCashYtdCents
 * − ausgabenYtdCents === saldoCents. Per-type Buchungen counts back the
 * stat-triplet micro-captions.
 *
 * RESET lane (conventions from booking-year-derivation.test.ts):
 *   pnpm test --run tests/unit/aurora-dashboard-domain.test.ts
 * globalSetup resets + migrates + seeds; app code connects as app_runtime.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { loadDashboardKpis } from "$lib/server/domain/dashboard.js";
import {
  createExpense,
  createIncome,
  createDonation,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { users } from "$lib/server/db/schema/users.js";
import { berlinYear } from "$lib/domain/year.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

const THIS_YEAR = berlinYear();
const CASH_DATE = `${THIS_YEAR}-01-15`;

describe.skipIf(!dbConfigured)("Aurora triplet loader semantics", () => {
  let ACTOR = "";
  let EXPENSE_KAT_ID = "";
  let INCOME_KAT_ID = "";
  let admin: ReturnType<typeof postgres>;

  beforeAll(async () => {
    admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    const [u] = await getDb()
      .insert(users)
      .values({
        email: "aurora-dashboard-domain-test@example.com",
        emailCanonical: "aurora-dashboard-domain-test@example.com",
        name: "Aurora Dashboard Domain Test",
      })
      .returning({ id: users.id });
    if (!u) throw new Error("failed to seed actor user");
    ACTOR = u.id;
    const [ke] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
    const [ki] = await admin<{ id: string }[]>`
      SELECT id FROM kategorien WHERE kind = 'income' LIMIT 1`;
    if (!ke || !ki) throw new Error("missing seeded expense/income kategorie");
    EXPENSE_KAT_ID = ke.id;
    INCOME_KAT_ID = ki.id;
  });

  afterAll(async () => {
    if (ACTOR) {
      const db = getDb();
      await db.delete(expenses).where(eq(expenses.createdByUserId, ACTOR));
      await db.delete(income).where(eq(income.createdByUserId, ACTOR));
      await db.delete(donations).where(eq(donations.createdByUserId, ACTOR));
      await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}`;
      await db.delete(users).where(eq(users.id, ACTOR));
    }
    await admin.end();
  });

  it("triplet reconciles with the hero Saldo before AND after new bookings, and counts increment per type", async () => {
    const before = await loadDashboardKpis(THIS_YEAR);

    // Identity holds on whatever the seed contains:
    expect(
      before.cashflow.einnahmenExclSpendenYtdCents +
        before.cashflow.spendenCashYtdCents,
    ).toBe(before.cashflow.einnahmenYtdCents);
    expect(before.cashflow.saldoCents).toBe(
      before.cashflow.einnahmenYtdCents - before.cashflow.ausgabenYtdCents,
    );

    await createIncome({
      bezeichnung: "aurora triplet income",
      betragCents: 1111,
      geldEingangDatum: CASH_DATE,
      kategorieId: INCOME_KAT_ID,
      actorUserId: ACTOR,
      businessId: await allocateBusinessId("E", THIS_YEAR),
    });
    await createDonation({
      betragCents: 2222,
      spendeKind: "geldspende",
      zweckbindungKind: "zweckfrei",
      spenderName: "Aurora Spender",
      zugewendetAm: CASH_DATE,
      actorUserId: ACTOR,
      businessId: await allocateBusinessId("S", THIS_YEAR),
    });
    await createExpense({
      bezeichnung: "aurora triplet expense",
      betragCents: 3333,
      abflussDatum: CASH_DATE,
      kategorieId: EXPENSE_KAT_ID,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
      belegVerzichtGrund: "test fixture — kein Beleg",
      actorUserId: ACTOR,
      businessId: await allocateBusinessId("A", THIS_YEAR),
    });

    const after = await loadDashboardKpis(THIS_YEAR);

    // Spenden are NOT in Einnahmen (the split this slice exists for):
    expect(after.cashflow.einnahmenExclSpendenYtdCents).toBe(
      before.cashflow.einnahmenExclSpendenYtdCents + 1111,
    );
    expect(after.cashflow.spendenCashYtdCents).toBe(
      before.cashflow.spendenCashYtdCents + 2222,
    );
    expect(after.cashflow.ausgabenYtdCents).toBe(
      before.cashflow.ausgabenYtdCents + 3333,
    );
    // Reconciliation identity still holds:
    expect(
      after.cashflow.einnahmenExclSpendenYtdCents +
        after.cashflow.spendenCashYtdCents,
    ).toBe(after.cashflow.einnahmenYtdCents);
    expect(after.cashflow.saldoCents).toBe(
      after.cashflow.einnahmenYtdCents - after.cashflow.ausgabenYtdCents,
    );
    // Per-type year-scoped Buchungen counts:
    expect(after.cashflow.einnahmenBuchungenCount).toBe(
      before.cashflow.einnahmenBuchungenCount + 1,
    );
    expect(after.cashflow.spendenBuchungenCount).toBe(
      before.cashflow.spendenBuchungenCount + 1,
    );
    expect(after.cashflow.ausgabenBuchungenCount).toBe(
      before.cashflow.ausgabenBuchungenCount + 1,
    );
  });

  it("a prior-year booking does not leak into the selected-year counts", async () => {
    const before = await loadDashboardKpis(THIS_YEAR);
    await createIncome({
      bezeichnung: "aurora prior-year income",
      betragCents: 999,
      geldEingangDatum: `${THIS_YEAR - 1}-12-28`,
      kategorieId: INCOME_KAT_ID,
      actorUserId: ACTOR,
      businessId: await allocateBusinessId("E", THIS_YEAR - 1),
    });
    const after = await loadDashboardKpis(THIS_YEAR);
    expect(after.cashflow.einnahmenBuchungenCount).toBe(
      before.cashflow.einnahmenBuchungenCount,
    );
    expect(after.cashflow.einnahmenExclSpendenYtdCents).toBe(
      before.cashflow.einnahmenExclSpendenYtdCents,
    );
  });
});
