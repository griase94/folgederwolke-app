/**
 * C3-DISC integration tests — markExpenseAsPaid (single source of truth for
 * the Bezahlt-markieren shortcut and the TransactionEditForm Erstattung block).
 *
 * Asserts:
 *   - happy path sets erstattet_am to the supplied date and flips status to
 *     'erstattet';
 *   - row-level festschreibung (`festgeschrieben_at IS NOT NULL`) is
 *     refused with a structured error per ADR-0006;
 *   - a SECOND mark on an already-erstattet row returns
 *     `{ok:false, error:'bereits bezahlt'}` and emits NO audit event (the
 *     0-row UPDATE used to silently return ok:true + a no-op expense.updated);
 *   - an existing real `abfluss_datum` is NOT clobbered (member/extern rows
 *     keep their cash-out date — only Verein-direct rows take `datum`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { markExpenseAsPaid } from "$lib/server/domain/transactions.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { users } from "$lib/server/db/schema/users.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  closeAdminConnection,
  resetFestgeschreibungBis,
} from "./_helpers/festschreibung-reset.js";

// markExpenseAsPaid emits expense.updated → the audit handler writes the
// audit_log row. Without the handlers registered the bus emit is a no-op and
// the no-audit-event assertions can't tell a fired event from a swallowed one.
registerHandlers();

// business_id must match `^(A|AUS)-[0-9]{4}-[0-9]{3,}$` and the 4-digit year
// inside it must equal year_of_buchung (computed from gebucht_am via Berlin TZ).
// We pin both to the current Berlin year via NOW() and a 9XXX counter.
const BUSINESS_ID_PREFIX = "AUS";
// Real seeded actor — audit_log.actor_user_id has an FK into users, so the
// audit handler can only write when this points at an existing user.
let ACTOR_USER_ID = "";

/** Resolve a seeded expense kategorie so the NOT-NULL kategorie_id is satisfied. */
async function anyExpenseKategorie(): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({ id: kategorien.id, name: kategorien.name })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  if (!row) throw new Error("no expense kategorie seeded");
  return row;
}

interface SeedOpts {
  /**
   * 'verein' | 'extern' — controls the bezahlt_von union + abfluss_datum policy.
   * (member would require a real members FK; extern is enough to exercise the
   * "non-Verein keeps its abfluss_datum" branch.)
   */
  bezahltVonKind?: "verein" | "extern";
  /** Pre-set abfluss_datum (YYYY-MM-DD) — used to prove it isn't clobbered. */
  abflussDatum?: string | null;
}

async function seedExpense(opts: SeedOpts = {}): Promise<string> {
  const db = getDb();
  const kat = await anyExpenseKategorie();
  const year = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
  });
  // 9XXX so cleanup pattern matches and we don't collide with real fixtures.
  const counter = `9${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  const businessId = `${BUSINESS_ID_PREFIX}-${year}-${counter}`;
  const kind = opts.bezahltVonKind ?? "verein";
  const display = kind === "verein" ? "Verein" : "Max Mustermann";
  const externName = kind === "extern" ? "Max Mustermann" : null;
  const abfluss = opts.abflussDatum ?? null;
  const rows = (await db.execute(sql`
    INSERT INTO expenses (
      business_id, bezeichnung, betrag_cents, currency, sphere_snapshot,
      kategorie_id, kategorie_name_snapshot, status, approved_at,
      bezahlt_von_kind, bezahlt_von_display, extern_name, abfluss_datum,
      beleg_verzicht_grund
    ) VALUES (
      ${businessId}, 'Test Auslage', 1000, 'EUR', 'ideeller',
      ${kat.id}::uuid, ${kat.name}, 'geprueft', NOW(),
      ${kind}, ${display}, ${externName}, ${abfluss}::date,
      'Testfixture ohne Beleg'
    )
    RETURNING id
  `)) as unknown as { id: string }[];
  return rows[0]!.id;
}

async function abflussDatumOf(expenseId: string): Promise<string | null> {
  const rows = (await getDb().execute(sql`
    SELECT abfluss_datum::text AS abfluss_datum
      FROM expenses WHERE id = ${expenseId}::uuid
  `)) as unknown as { abfluss_datum: string | null }[];
  return rows[0]?.abfluss_datum ?? null;
}

async function auditCountFor(expenseId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(eq(auditLog.entityKind, "expense"), eq(auditLog.entityId, expenseId)),
    );
  return rows.length;
}

describe("markExpenseAsPaid", () => {
  beforeAll(async () => {
    const [u] = await getDb()
      .insert(users)
      .values({
        email: "mark-expense-paid-test@example.com",
        emailCanonical: "mark-expense-paid-test@example.com",
        name: "Mark Paid Test Actor",
      })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (u) {
      ACTOR_USER_ID = u.id;
    } else {
      const [existing] = await getDb()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "mark-expense-paid-test@example.com"))
        .limit(1);
      ACTOR_USER_ID = existing!.id;
    }
  });

  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    // Cleanup prior test seeds (any year, counter prefix 9). audit_log is
    // append-only (app_runtime cannot DELETE), so we do NOT touch it — the
    // no-audit-event assertions count by the row's OWN entity_id (a fresh uuid
    // per seed), so straggler audit rows on other expenses never pollute them.
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

  // NOTE (ADR-0006 Nachtrag / migration 0038): markExpenseAsPaid no longer
  // pre-checks the row's `festgeschrieben_at` stamp — the settings-based DB
  // trigger is the sole enforcer, permitting only the payment columns on a
  // festgeschriebene Auslage. The fest behaviour (payment carve-out ALLOWED
  // when abfluss is already set; a Verein-direct NULL-abfluss row REJECTED with
  // an honest 409) is tested authoritatively in
  // festschreibung-cash-year-gate.test.ts (settings-locked, both cases) and at
  // the trigger level in festschreibung-carveout.test.ts. The old row-stamp
  // shortcut assertion is therefore removed — the mechanism it exercised no
  // longer exists.

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

  it("refuses a SECOND mark on an already-erstattet row (bereits bezahlt) and emits NO extra audit event", async () => {
    const expenseId = await seedExpense();

    const first = await markExpenseAsPaid(expenseId, {
      datum: "2025-05-15",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(first.ok).toBe(true);
    const auditAfterFirst = await auditCountFor(expenseId);
    expect(auditAfterFirst).toBe(1);

    const second = await markExpenseAsPaid(expenseId, {
      datum: "2025-06-20",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/bereits bezahlt/i);
    }
    // No new audit row — the 0-row UPDATE must NOT emit expense.updated.
    expect(await auditCountFor(expenseId)).toBe(auditAfterFirst);
    // The second datum must NOT have overwritten the first erstattet_am.
    const rows = (await getDb().execute(sql`
      SELECT erstattet_am::text AS erstattet_am FROM expenses WHERE id = ${expenseId}::uuid
    `)) as unknown as { erstattet_am: string | null }[];
    expect(rows[0]!.erstattet_am).toBe("2025-05-15");
  });

  it("does NOT clobber a real abfluss_datum for a non-Verein row", async () => {
    // Member/extern rows already have their own cash-out date; marking them
    // erstattet must NOT overwrite it with the reimbursement date.
    const expenseId = await seedExpense({
      bezahltVonKind: "extern",
      abflussDatum: "2025-01-10",
    });
    const res = await markExpenseAsPaid(expenseId, {
      datum: "2025-05-15",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(res.ok).toBe(true);
    expect(await abflussDatumOf(expenseId)).toBe("2025-01-10");
  });

  it("sets abfluss_datum from datum when the row had none (Verein-direct)", async () => {
    const expenseId = await seedExpense({
      bezahltVonKind: "verein",
      abflussDatum: null,
    });
    const res = await markExpenseAsPaid(expenseId, {
      datum: "2025-05-15",
      zahlartId: null,
      actorUserId: ACTOR_USER_ID,
    });
    expect(res.ok).toBe(true);
    expect(await abflussDatumOf(expenseId)).toBe("2025-05-15");
  });
});
