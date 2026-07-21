/**
 * @vitest-environment node
 *
 * Verifies the spec §4.1 "Kein Beleg vorhanden → Begründung" seam:
 * `createExpense` accepts + persists `belegVerzichtGrund`, so an expense with
 * NO Beleg file can be created by supplying a Verzicht-Begründung instead. This
 * proves both that the new field is persisted AND that such a row satisfies
 * `expenses_beleg_or_grund_ck` (beleg_file_id IS NOT NULL OR
 * beleg_verzicht_grund IS NOT NULL). Mirrors the §4.6 belegFileId amendment on
 * createIncome.
 *
 * Relies on the RESET lane:
 *   pnpm test --run tests/unit/create-expense-beleg-verzicht.test.ts
 * — globalSetup resets + migrates + seeds before this file runs (the seeded
 *   kategorie "Bankgebühren" (expense, ideeller) must exist).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createExpense } from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { users } from "$lib/server/db/schema/users.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { and, eq } from "drizzle-orm";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// expenses.created_by_user_id is an FK → users.id, so we seed a real actor
// (no users are seeded — same gotcha as create-expense-income-kategorie).
let ACTOR = "";

describe.skipIf(!dbConfigured)(
  "createExpense: persists belegVerzichtGrund (kein-Beleg path, spec §4.1)",
  () => {
    beforeAll(async () => {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: "expense-beleg-verzicht-test@example.com",
          emailCanonical: "expense-beleg-verzicht-test@example.com",
          name: "Expense Beleg-Verzicht Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;
    });

    afterAll(async () => {
      if (!ACTOR) return;
      const db = getDb();
      // expenses.created_by_user_id is ON DELETE RESTRICT — delete expenses first.
      await db.delete(expenses).where(eq(expenses.createdByUserId, ACTOR));
      await db.delete(users).where(eq(users.id, ACTOR));
    });

    it("expense with no Beleg but a Verzicht-Begründung persists + satisfies the CHECK", async () => {
      const businessId = await allocateBusinessId("A", 2026);
      const [kat] = await getDb()
        .select({ id: kategorien.id })
        .from(kategorien)
        .where(
          and(
            eq(kategorien.kind, "expense"),
            eq(kategorien.name, "Bankgebühren"),
          ),
        )
        .limit(1);
      if (!kat) throw new Error("seed missing expense/Bankgebühren");
      const { id } = await createExpense({
        bezeichnung: "Kontoführung",
        betragCents: 490,
        kategorieId: kat.id,
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        // No Beleg file — the Verzicht-Begründung is what satisfies
        // expenses_beleg_or_grund_ck on this path.
        belegFileId: null,
        belegVerzichtGrund: "Bankgebühr – kein Beleg",
        actorUserId: ACTOR,
        businessId,
      });

      const [row] = await getDb()
        .select()
        .from(expenses)
        .where(eq(expenses.id, id))
        .limit(1);

      expect(row).toBeDefined();
      if (!row) throw new Error("expense row not found");
      expect(row.belegFileId).toBeNull();
      expect(row.belegVerzichtGrund).toBe("Bankgebühr – kein Beleg");
    });
  },
);
