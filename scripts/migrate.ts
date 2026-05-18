/**
 * Programmatic Drizzle migration runner.
 * Usage: tsx scripts/migrate.ts
 * Requires DIRECT_DATABASE_URL in environment (not the pooled URL).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env["DIRECT_DATABASE_URL"];
if (!url) {
  console.error("ERROR: DIRECT_DATABASE_URL is not set.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

console.log("Running migrations from ./drizzle …");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");

await client.end();
