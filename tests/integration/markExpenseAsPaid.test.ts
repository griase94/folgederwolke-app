/**
 * C3-DISC integration tests — markExpenseAsPaid (single source of truth for
 * the Bezahlt-markieren shortcut and the TransactionEditForm Erstattung block).
 *
 * Asserts:
 *   - happy path sets erstattet_am to the supplied date and flips status to
 *     'erstattet';
 *   - row-level festschreibung (`festgeschrieben_at IS NOT NULL`) is
 *     refused with a structured error per ADR-0006.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { markExpenseAsPaid } from "$lib/server/domain/transactions.js";
import {
  closeAdminConnection,
  resetFestgeschreibungBis,
} from "./_helpers/festschreibung-reset.js";

// business_id must match `^(A|AUS)-[0-9]{4}-[0-9]{3,}$` and the 4-digit year
// inside it must equal year_of_buchung (computed from gebucht_am via Berlin TZ).
// We pin both to the current Berlin year via NOW() and a 9XXX counter.
const BUSINESS_ID_PREFIX = "AUS";
const ACTOR_USER_ID = "00000000-0000-0000-0000-000000000001";

async function seedExpense(): Promise<string> {
  const db = getDb();
  const year = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
  });
  // 9XXX so cleanup pattern matches and we don't collide with real fixtures.
  const counter = `9${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const businessId = `${BUSINESS_ID_PREFIX}-${year}-${counter}`;
  const rows = (await db.execute(sql`
    INSERT INTO expenses (
      business_id, bezeichnung, betrag_cents, currency, sphere_snapshot,
      kategorie_name_snapshot, status, approved_at, bezahlt_von_kind,
      bezahlt_von_display
    ) VALUES (
      ${businessId}, 'Test Auslage', 1000, 'EUR', 'ideeller',
      'Test-Kategorie', 'geprueft', NOW(), 'verein', 'Verein'
    )
    RETURNING id
  `)) as unknown as { id: string }[];
  return rows[0]!.id;
}

describe("markExpenseAsPaid", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    // Cleanup prior test seeds (any year, counter prefix 9).
    await getDb().execute(sql`
      DELETE FROM expenses WHERE business_id ~ '^AUS-[0-9]{4}-9[0-9]{6}$'
    `);
  });

  it("sets erstattet_am to the supplied date and status to 'erstattet'", async () => {
    const expenseId = await seedExpense();
    const res = await markExpenseAsPaid(expenseId, {
      datum: "2025-05-15",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(res.ok).toBe(true);

    const rows = (await getDb().execute(sql`
      SELECT erstattet_am::text AS erstattet_am, status::text AS status
        FROM expenses WHERE id = ${expenseId}::uuid
    `)) as unknown as { erstattet_am: string | null; status: string }[];
    expect(rows[0]!.erstattet_am).toBe("2025-05-15");
    expect(rows[0]!.status).toBe("erstattet");
  });

  it("refuses when the expense row is festgeschrieben", async () => {
    const expenseId = await seedExpense();
    await getDb().execute(sql`
      UPDATE expenses SET festgeschrieben_at = NOW() WHERE id = ${expenseId}::uuid
    `);
    const res = await markExpenseAsPaid(expenseId, {
      datum: "2025-05-15",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/festgeschrieben/i);
    }
  });

  it("rejects an invalid date format", async () => {
    const expenseId = await seedExpense();
    const res = await markExpenseAsPaid(expenseId, {
      datum: "15.05.2025",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/datum/i);
    }
  });
});
