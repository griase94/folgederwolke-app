import { env } from "$lib/server/env.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// prepare: false required for Neon's pooled connection (per §10.6.4 #3)
// max: 5 prevents connection storms on serverless
export const client = postgres(env.DATABASE_URL, { prepare: false, max: 5 });

export const db = drizzle(client, { schema });
