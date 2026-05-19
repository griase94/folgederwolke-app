import { describe, expect, it } from "vitest";
import postgres from "postgres";

describe("0012 default privileges", () => {
  it("grants CRUD on a newly-created table to app_runtime without explicit GRANT", async () => {
    const url = process.env.DIRECT_DATABASE_URL!;
    const sql = postgres(url, { prepare: false, max: 1 });

    try {
      await sql`CREATE TABLE _privilege_test (id int)`;
      const rows = await sql<{ can_insert: boolean; can_select: boolean }[]>`
        SELECT
          has_table_privilege('app_runtime', '_privilege_test', 'INSERT') AS can_insert,
          has_table_privilege('app_export',  '_privilege_test', 'SELECT') AS can_select
      `;
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row!.can_insert).toBe(true);
      expect(row!.can_select).toBe(true);
    } finally {
      await sql`DROP TABLE IF EXISTS _privilege_test`;
      await sql.end();
    }
  });
});
