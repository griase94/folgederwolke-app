/**
 * @vitest-environment node
 *
 * Task-10 (Phase-1 Foundation): proves migration 0031 installed the
 * NOT NULL + CHECK constraints that the whole phase prepared for.
 *
 * Two layers of assertions:
 *   1. Structural — `kategorie_id` is NOT NULL on expenses/income/donations,
 *      and the three named CHECK constraints exist in pg_constraint.
 *   2. Behavioral (negative cases) — each CHECK actually REJECTS a violating
 *      row. We drive the inserts through the create-fns (createExpense /
 *      createDonation) so EVERY other required field is set correctly and the
 *      ONLY violation is the targeted one — this avoids false-positives where
 *      an unrelated NOT NULL error masquerades as the CHECK firing. Positive
 *      controls confirm the constraint admits a valid row.
 *
 * RESET lane:
 *   pnpm test --run tests/unit/migration-0031-constraints.test.ts
 * — globalSetup resets + migrates (0001→0031) + seeds before this file runs,
 *   so the seeded expense kategorie "Bürobedarf" + donation-derivation income
 *   kategorien exist.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  createExpense,
  createDonation,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { users } from "$lib/server/db/schema/users.js";
import { files } from "$lib/server/db/schema/files.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { donations } from "$lib/server/db/schema/donations.js";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// expenses/donations FKs (created_by_user_id, beleg_file_id) require real rows.
let ACTOR = "";
let BELEG_FILE_ID = "";

describe.skipIf(!dbConfigured)("migration 0031 constraints", () => {
  beforeAll(async () => {
    const [u] = await getDb()
      .insert(users)
      .values({
        email: "migration-0031-test@example.com",
        emailCanonical: "migration-0031-test@example.com",
        name: "Migration 0031 Test",
      })
      .returning({ id: users.id });
    if (!u) throw new Error("failed to seed actor user");
    ACTOR = u.id;

    // A real Beleg file so the positive control on expenses_beleg_or_grund_ck
    // can attach a non-null beleg_file_id (FK → files.id, onDelete restrict).
    const [f] = await getDb()
      .insert(files)
      .values({
        storageKey: "test/migration-0031-beleg.pdf",
        storageBackend: "blob",
        mimeType: "application/pdf",
        byteSize: BigInt(1234),
        // Must match files_sha256_check: ^[0-9a-f]{64}$
        sha256:
          "00310031003100310031003100310031003100310031003100310031abcdabcd",
        originalFilename: "beleg.pdf",
        kind: "beleg",
        sourceKind: "app",
        uploadedByUserId: ACTOR,
      })
      .returning({ id: files.id });
    if (!f) throw new Error("failed to seed beleg file");
    BELEG_FILE_ID = f.id;
  });

  afterAll(async () => {
    if (!ACTOR) return;
    const db = getDb();
    // 1. Delete expenses (beleg_file_id ON DELETE RESTRICT refs BELEG_FILE_ID)
    await db.delete(expenses).where(eq(expenses.createdByUserId, ACTOR));
    // 2. Delete donations (created_by_user_id ON DELETE SET NULL — clean up explicitly)
    await db.delete(donations).where(eq(donations.createdByUserId, ACTOR));
    // 3. Delete audit_log via superuser (app_runtime cannot DELETE, ADR-0004)
    const admin = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}`;
    } finally {
      await admin.end();
    }
    // 4. Delete file (uploaded_by_user_id ON DELETE RESTRICT — delete before user)
    if (BELEG_FILE_ID) {
      await db.delete(files).where(eq(files.id, BELEG_FILE_ID));
    }
    // 5. Delete user (now no FK refs remain)
    await db.delete(users).where(eq(users.id, ACTOR));
  });

  // ----- Structural -------------------------------------------------------

  it("kategorie_id is NOT NULL on all three tables", async () => {
    const rows = (await getDb().execute(sql`
      SELECT table_name, is_nullable
        FROM information_schema.columns
       WHERE column_name = 'kategorie_id'
         AND table_name IN ('expenses', 'income', 'donations')
    `)) as unknown as { table_name: string; is_nullable: string }[];

    const byTable = new Map(rows.map((r) => [r.table_name, r.is_nullable]));
    expect(byTable.get("expenses")).toBe("NO");
    expect(byTable.get("income")).toBe("NO");
    expect(byTable.get("donations")).toBe("NO");
  });

  it("the three CHECK constraints exist", async () => {
    const rows = (await getDb().execute(sql`
      SELECT conname
        FROM pg_constraint
       WHERE conname IN (
         'expenses_beleg_or_grund_ck',
         'donations_zweckbindung_text_ck',
         'donations_sachspende_wertermittlung_ck'
       )
    `)) as unknown as { conname: string }[];

    expect(rows).toHaveLength(3);
  });

  // ----- Behavioral: expenses_beleg_or_grund_ck ---------------------------

  it("rejects an expense with neither Beleg nor Verzicht-Grund", async () => {
    const businessId = await allocateBusinessId("AUS", 2026);
    // createExpense never sets beleg_verzicht_grund and we pass belegFileId:null
    // → both sides of the CHECK are NULL → the CHECK must reject.
    await expect(
      createExpense({
        bezeichnung: "Kein Beleg, keine Begründung",
        betragCents: 1000,
        kategorieNameSnapshot: "Bürobedarf",
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        belegFileId: null,
        actorUserId: ACTOR,
        businessId,
      }),
    ).rejects.toThrow();
  });

  it("admits an expense WITH a Beleg (positive control)", async () => {
    const businessId = await allocateBusinessId("AUS", 2026);
    await expect(
      createExpense({
        bezeichnung: "Mit Beleg",
        betragCents: 1000,
        kategorieNameSnapshot: "Bürobedarf",
        bezahltVonKind: "verein",
        bezahltVonDisplay: "Verein",
        belegFileId: BELEG_FILE_ID,
        actorUserId: ACTOR,
        businessId,
      }),
    ).resolves.toMatchObject({ businessId });
  });

  // ----- Behavioral: donations_zweckbindung_text_ck -----------------------

  it("rejects a zweckgebundene Spende with no Zweckbindungstext", async () => {
    const businessId = await allocateBusinessId("S", 2026);
    await expect(
      createDonation({
        betragCents: 5000,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        zweckbindungText: null,
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      }),
    ).rejects.toThrow();
  });

  it("admits a zweckgebundene Spende WITH Zweckbindungstext (positive control)", async () => {
    const businessId = await allocateBusinessId("S", 2026);
    await expect(
      createDonation({
        betragCents: 5000,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        zweckbindungText: "Notenständer",
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      }),
    ).resolves.toMatchObject({ businessId });
  });

  // ----- Behavioral: donations_sachspende_wertermittlung_ck ---------------

  it("rejects a Sachspende with no Wertermittlung method + Zustandsbeschreibung", async () => {
    const businessId = await allocateBusinessId("S", 2026);
    await expect(
      createDonation({
        betragCents: 5000,
        spendeKind: "sachspende",
        wertermittlungMethode: null,
        zustandBeschreibung: null,
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      }),
    ).rejects.toThrow();
  });

  it("admits a Sachspende WITH Wertermittlung + Zustand (positive control)", async () => {
    const businessId = await allocateBusinessId("S", 2026);
    await expect(
      createDonation({
        betragCents: 5000,
        spendeKind: "sachspende",
        wertermittlungMethode: "marktpreis",
        zustandBeschreibung: "Beamer Epson, gebraucht",
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      }),
    ).resolves.toMatchObject({ businessId });
  });
});
