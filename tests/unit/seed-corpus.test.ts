/**
 * @vitest-environment node
 *
 * Task-11 (Phase-1 Foundation): proves the showcase transaction corpus
 * (`seedTransactionCorpus`) is seeded by `seedFixtures` on every DB-test
 * reset, and that it is broad enough to exercise the three transaction tabs.
 *
 * Asserts (per plan):
 *   - expenses cover >=3 statuses (geprueft, erstattet, abgelehnt) AND
 *     >=3 distinct sphere_snapshot.
 *   - income spans all FOUR spheres (ideeller, vermoegen, zweckbetrieb,
 *     wirtschaftlich).
 *   - donations cover geldspende + sachspende across >=2 distinct
 *     year_of_buchung.
 *
 * RESET lane:
 *   pnpm test --run tests/unit/seed-corpus.test.ts
 * — globalSetup resets + migrates (0001→0031) + seeds (incl. the corpus)
 *   before this file runs. If ANY corpus row violated a CHECK/NOT NULL the
 *   seed itself would have failed and this whole file would error out.
 */

import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("showcase seed corpus", () => {
  it("expenses cover >=3 statuses and >=3 spheres", async () => {
    const db = getDb();
    const s = await db.execute<{ status: string }>(
      sql`SELECT DISTINCT status FROM expenses`,
    );
    expect((s as { status: string }[]).map((r) => r.status)).toEqual(
      expect.arrayContaining(["geprueft", "erstattet", "abgelehnt"]),
    );
    const sp = await db.execute(
      sql`SELECT DISTINCT sphere_snapshot FROM expenses`,
    );
    expect((sp as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it("income spans all four spheres", async () => {
    const db = getDb();
    const sp = await db.execute<{ sphere_snapshot: string }>(
      sql`SELECT DISTINCT sphere_snapshot FROM income`,
    );
    expect(
      (sp as { sphere_snapshot: string }[]).map((r) => r.sphere_snapshot),
    ).toEqual(
      expect.arrayContaining([
        "ideeller",
        "vermoegen",
        "zweckbetrieb",
        "wirtschaftlich",
      ]),
    );
  });

  it("donations cover Geldspende + Sachspende across >=2 years", async () => {
    const db = getDb();
    const k = await db.execute<{ spende_kind: string }>(
      sql`SELECT DISTINCT spende_kind FROM donations`,
    );
    expect((k as { spende_kind: string }[]).map((r) => r.spende_kind)).toEqual(
      expect.arrayContaining(["geldspende", "sachspende"]),
    );
    const y = await db.execute(
      sql`SELECT DISTINCT year_of_buchung FROM donations`,
    );
    expect((y as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("paid invoice links to its income receipt (guards the re-seed fallback)", async () => {
    const db = getDb();
    const rows = await db.execute<{
      paid_by_income_id: string | null;
      income_business_id: string | null;
    }>(
      sql`SELECT i.paid_by_income_id, inc.business_id AS income_business_id
          FROM invoices i
          LEFT JOIN income inc ON inc.id = i.paid_by_income_id
          WHERE i.business_id = 'FDW-2026-001'`,
    );
    const arr = rows as {
      paid_by_income_id: string | null;
      income_business_id: string | null;
    }[];
    expect(arr).toHaveLength(1);
    const [invoice] = arr;
    expect(invoice?.paid_by_income_id).not.toBeNull();
    expect(invoice?.income_business_id).toBe("E-2026-905");
  });
});
