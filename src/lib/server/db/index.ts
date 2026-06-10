import { env } from "$lib/server/env.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// Lazy singletons — postgres-js validates URL at construction, and SvelteKit's
// build-time `analyse` step runs server modules with an empty env. Deferring
// instantiation lets `pnpm build` succeed without DATABASE_URL set.
let _client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getClient(): ReturnType<typeof postgres> {
  if (!_client) {
    // Prefer the live process.env (it is "always the current node runtime env")
    // over the $env/dynamic singleton, which can carry a stale/duplicated value
    // from module-bundle duplication. This also lets the test harness inject a
    // per-worker DATABASE_URL (tests/setup/per-worker-db.ts) deterministically.
    // In production both resolve to the same Vercel-provided value.
    const url = process.env["DATABASE_URL"] || env.DATABASE_URL || "";
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set; cannot connect to Postgres at runtime",
      );
    }
    // prepare: false required for Neon's pooled connection (per §10.6.4 #3)
    // max: 5 prevents connection storms on serverless
    _client = postgres(url, { prepare: false, max: 5 });
  }
  return _client;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) _db = drizzle(getClient(), { schema });
  return _db;
}
