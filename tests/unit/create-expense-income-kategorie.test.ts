/**
 * @vitest-environment node
 *
 * Verifies that `createExpense` and `createIncome` RESOLVE a non-null Kategorie
 * from `kategorieNameSnapshot` and DERIVE `sphereSnapshot` strictly from the
 * resolved kategorie (no project override, spec §4.5). Also verifies the
 * §4.6 amendment: `createIncome` now persists `belegFileId` (the column existed
 * but the fn previously dropped it — Phase 5 "Beleg optional" depends on it).
 *
 * Relies on the RESET lane:
 *   pnpm test --run tests/unit/create-expense-income-kategorie.test.ts
 * — globalSetup resets + migrates + seeds before this file runs (the seeded
 *   kategorien "Bankgebühren" (expense, ideeller) and "Eintritt" (income,
 *   zweckbetrieb) must exist).
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  createExpense,
  createIncome,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { users } from "$lib/server/db/schema/users.js";
import { files } from "$lib/server/db/schema/files.js";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// expenses/income.created_by_user_id is an FK → users.id, so we seed a real
// actor (no users are seeded — same gotcha as create-donation-derivation).
let ACTOR = "";
// income.beleg_file_id is an FK → files.id, so we seed a real file to assert
// real persistence of the §4.6 amendment.
let BELEG_FILE_ID = "";

describe.skipIf(!dbConfigured)(
  "createExpense/createIncome: resolve non-null kategorie + derive sphere",
  () => {
    beforeAll(async () => {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: "expense-income-kategorie-test@example.com",
          emailCanonical: "expense-income-kategorie-test@example.com",
          name: "Expense/Income Kategorie Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;

      const [f] = await getDb()
        .insert(files)
        .values({
          storageKey: "test/expense-income-kategorie/beleg.pdf",
          // files_storage_backend_check requires 'blob' | 'local-fs'.
          storageBackend: "local-fs",
          mimeType: "application/pdf",
          byteSize: BigInt(1024),
          // files_sha256_check requires 64 lowercase hex chars.
          sha256: "a".repeat(64),
          originalFilename: "beleg.pdf",
          kind: "beleg",
          sourceKind: "app",
          uploadedByUserId: ACTOR,
        })
        .returning({ id: files.id });
      if (!f) throw new Error("failed to seed beleg file");
      BELEG_FILE_ID = f.id;
    });

    it("expense from 'Bankgebühren' → kategorieId non-null, sphere 'ideeller'", async () => {
      const businessId = await allocateBusinessId("A", 2026);
      const { id } = await createExpense({
        bezeichnung: "Kontoführung",
        betragCents: 490,
        kategorieNameSnapshot: "Bankgebühren",
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        // createExpense persists ONLY belegFileId (it never reads a
        // belegVerzichtGrund input), so a Beleg is the only way to satisfy
        // expenses_beleg_or_grund_ck from this path. Attach the seeded file.
        belegFileId: BELEG_FILE_ID,
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
      expect(row.kategorieId).not.toBeNull();
      expect(row.sphereSnapshot).toBe("ideeller");
      expect(row.kategorieNameSnapshot).toBe("Bankgebühren");
    });

    it("income from 'Eintritt' → kategorieId non-null, sphere 'zweckbetrieb'", async () => {
      const businessId = await allocateBusinessId("E", 2026);
      const { id } = await createIncome({
        bezeichnung: "Tickets",
        betragCents: 124000,
        kategorieNameSnapshot: "Eintritt",
        actorUserId: ACTOR,
        businessId,
      });

      const [row] = await getDb()
        .select()
        .from(income)
        .where(eq(income.id, id))
        .limit(1);

      expect(row).toBeDefined();
      if (!row) throw new Error("income row not found");
      expect(row.kategorieId).not.toBeNull();
      expect(row.sphereSnapshot).toBe("zweckbetrieb");
      expect(row.kategorieNameSnapshot).toBe("Eintritt");
    });

    it("income persists belegFileId (§4.6 amendment)", async () => {
      const businessId = await allocateBusinessId("E", 2026);
      const { id } = await createIncome({
        bezeichnung: "Tickets mit Beleg",
        betragCents: 5000,
        kategorieNameSnapshot: "Eintritt",
        belegFileId: BELEG_FILE_ID,
        actorUserId: ACTOR,
        businessId,
      });

      const [row] = await getDb()
        .select()
        .from(income)
        .where(eq(income.id, id))
        .limit(1);

      expect(row).toBeDefined();
      if (!row) throw new Error("income row not found");
      expect(row.belegFileId).toBe(BELEG_FILE_ID);
    });
  },
);
