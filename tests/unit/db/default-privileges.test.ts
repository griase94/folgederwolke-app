import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import postgres from "postgres";

/**
 * Read DIRECT_DATABASE_URL from process.env, falling back to parsing .env.test
 * directly. Vitest's globalSetup spawns reset-test-db.sh as a child process
 * (which sources .env.test in its own shell), but does not export those vars
 * into the vitest worker's process.env. Task 17 introduces dotenv for the
 * Playwright globalSetup; until then, parse the file ourselves so this test
 * is self-contained.
 */
function loadDirectDatabaseUrl(): string {
  if (process.env.DIRECT_DATABASE_URL) return process.env.DIRECT_DATABASE_URL;
  const raw = readFileSync(".env.test", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*DIRECT_DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, "");
  }
  throw new Error("DIRECT_DATABASE_URL not found in env or .env.test");
}

describe("0012 default privileges", () => {
  it("grants CRUD on a newly-created table to app_runtime without explicit GRANT", async () => {
    const url = loadDirectDatabaseUrl();
    const sql = postgres(url, { prepare: false, max: 1 });

    try {
      await sql`CREATE TABLE _privilege_test (id int)`;
      const rows = await sql<{ can_insert: boolean; can_select: boolean }[]>`
        SELECT
          has_table_privilege('app_runtime', '_privilege_test', 'INSERT') AS can_insert,
          has_table_privilege('app_export',  '_privilege_test', 'SELECT') AS can_select
      `;
      expect(rows[0].can_insert).toBe(true);
      expect(rows[0].can_select).toBe(true);
    } finally {
      await sql`DROP TABLE IF EXISTS _privilege_test`;
      await sql.end();
    }
  });
});
