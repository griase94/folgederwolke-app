import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("migration 0029 — additive columns", () => {
  it("adds wertermittlung_methode enum + donation/expense columns", async () => {
    const db = getDb();
    const cols = await db.execute<{
      table_name: string;
      column_name: string;
    }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE (table_name = 'donations' AND column_name IN ('wertermittlung_methode','zustand_beschreibung','herkunftsbeleg_file_id','betriebsvermoegen'))
         OR (table_name = 'expenses'  AND column_name = 'beleg_verzicht_grund')`);
    const names = cols.map((c) => `${c.table_name}.${c.column_name}`);
    expect(names).toEqual(
      expect.arrayContaining([
        "donations.wertermittlung_methode",
        "donations.zustand_beschreibung",
        "donations.herkunftsbeleg_file_id",
        "donations.betriebsvermoegen",
        "expenses.beleg_verzicht_grund",
      ]),
    );
    const ev = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE t.typname='wertermittlung_methode' ORDER BY e.enumsortorder`);
    expect(ev.map((r) => r.enumlabel)).toEqual([
      "marktpreis",
      "kaufbeleg",
      "schaetzung",
      "buchwert",
    ]);
  });
});
