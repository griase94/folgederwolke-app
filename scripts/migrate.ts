/**
 * Programmatic Drizzle migration runner.
 *
 * Invocation:
 *   pnpm tsx scripts/migrate.ts                # one-shot, e.g. local dev
 *   pnpm vercel-build                          # auto-invoked by Vercel on deploy
 *
 * Env:
 *   DIRECT_DATABASE_URL  Required for migrations to actually run.
 *   VERCEL_ENV           Vercel sets this to "production" / "preview" /
 *                        "development". On preview + development we
 *                        silently skip migrations so a PR's preview
 *                        deploy doesn't try to mutate the production DB.
 *                        Override with FORCE_MIGRATE=true if you want
 *                        migrations on preview (e.g. a Neon branch URL).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env["DIRECT_DATABASE_URL"];
const vercelEnv = process.env["VERCEL_ENV"];
const force = process.env["FORCE_MIGRATE"] === "true";

if (vercelEnv && vercelEnv !== "production" && !force) {
  console.log(
    `[migrate] VERCEL_ENV=${vercelEnv} (not production) and FORCE_MIGRATE!=true — skipping migrations.`,
  );
  process.exit(0);
}

if (!url) {
  console.error(
    "[migrate] ERROR: DIRECT_DATABASE_URL is not set. Set it in Vercel project env (Production scope at minimum) or `pnpm vercel-build` will fail.",
  );
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);

console.log("[migrate] Running migrations from ./drizzle …");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] Migrations complete.");

await client.end();
