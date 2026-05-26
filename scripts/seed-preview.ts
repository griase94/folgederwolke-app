#!/usr/bin/env tsx
/**
 * Idempotent baseline seed for the preview Neon branch.
 *
 * Ensures the e2e-admin user row exists (admin status comes from
 * ADMIN_EMAILS env, not a schema column) and applies the same reference
 * fixtures the local dev DB uses. Safe to run before every preview-e2e
 * workflow.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/lib/server/db/schema/index.js";
import { canonicalizeEmail } from "../src/lib/domain/email.js";
import { seedFixtures } from "./seed-fixtures.js";

async function main() {
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) throw new Error("DIRECT_DATABASE_URL required");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    const email = "e2e-admin@folgederwolke.de";
    await db
      .insert(schema.users)
      .values({
        email,
        emailCanonical: canonicalizeEmail(email),
        name: "E2E Admin",
      })
      .onConflictDoNothing({ target: schema.users.emailCanonical });

    await seedFixtures(db);
  } finally {
    await client.end();
  }

  console.log("preview seed applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
