/**
 * @vitest-environment node
 * @phase-aurora-slice4
 *
 * Aurora slice 4 — per-project Buchungen counts for the Projekte card
 * (spec §7: row = name · Buchungen-count · saldo). Count basis = income +
 * expenses rows linked to the project (the same set that drives saldoCents).
 *
 * RESET lane: pnpm test --run tests/unit/aurora-top-projects.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { batchProjectFinancials } from "$lib/server/domain/projects.js";
import { topActiveProjects } from "$lib/server/domain/dashboard.js";
import { createExpense } from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { users } from "$lib/server/db/schema/users.js";
import { berlinYear } from "$lib/domain/year.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("Aurora per-project Buchungen counts", () => {
  let ACTOR = "";
  let EXPENSE_KAT = "";
  let PROJECT_ID = "";
  let admin: ReturnType<typeof postgres>;

  beforeAll(async () => {
    admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    const [u] = await getDb()
      .insert(users)
      .values({
        email: "aurora-top-projects-test@example.com",
        emailCanonical: "aurora-top-projects-test@example.com",
        name: "Aurora Top Projects Test",
      })
      .returning({ id: users.id });
    if (!u) throw new Error("failed to seed actor user");
    ACTOR = u.id;
    const [ke] = await admin<{ name: string }[]>`
      SELECT name FROM kategorien WHERE kind = 'expense' LIMIT 1`;
    if (!ke) throw new Error("missing seeded expense kategorie");
    EXPENSE_KAT = ke.name;
    const [p] = await admin<{ id: string }[]>`
      SELECT id FROM projects WHERE deleted_at IS NULL LIMIT 1`;
    if (!p) throw new Error("seed contains no active project");
    PROJECT_ID = p.id;
  });

  afterAll(async () => {
    if (ACTOR) {
      const db = getDb();
      await db.delete(expenses).where(eq(expenses.createdByUserId, ACTOR));
      await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}`;
      await db.delete(users).where(eq(users.id, ACTOR));
    }
    await admin.end();
  });

  it("buchungenCount counts income+expense rows of the project and increments with a new booking", async () => {
    const before = (await batchProjectFinancials([PROJECT_ID]))[PROJECT_ID]!;
    expect(typeof before.buchungenCount).toBe("number");

    const year = berlinYear();
    await createExpense({
      bezeichnung: "aurora project booking",
      betragCents: 1500,
      abflussDatum: `${year}-01-20`,
      kategorieNameSnapshot: EXPENSE_KAT,
      bezahltVonKind: "verein",
      bezahltVonDisplay: "Verein",
      belegVerzichtGrund: "test fixture — kein Beleg",
      projectId: PROJECT_ID,
      actorUserId: ACTOR,
      businessId: await allocateBusinessId("A", year),
    });

    const after = (await batchProjectFinancials([PROJECT_ID]))[PROJECT_ID]!;
    expect(after.buchungenCount).toBe(before.buchungenCount + 1);
    expect(after.saldoCents).toBe(before.saldoCents - 1500);
  });

  it("topActiveProjects rows carry buchungenCount", async () => {
    const rows = await topActiveProjects(5);
    for (const r of rows) {
      expect(typeof r.buchungenCount).toBe("number");
      expect(r.buchungenCount).toBeGreaterThanOrEqual(0);
    }
  });
});
