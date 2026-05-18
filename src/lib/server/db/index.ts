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
    // Read directly from process.env to bypass any module-bundle duplication
    // where the env.ts singleton sees a stale (empty) value. process.env is
    // always the current node runtime env.
    const url = env.DATABASE_URL || process.env["DATABASE_URL"] || "";
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
