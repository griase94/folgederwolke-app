import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/server/db/schema/index.js";
import { mintSession } from "./mint-session.js";
import { canonicalizeEmail } from "../src/lib/domain/email.js";

const url =
  process.env["DATABASE_URL"] ||
  "postgres://app_runtime:app_runtime@127.0.0.1:15432/folgederwolke_test";

describe("mintSession", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const email = "mint-session-test@example.com";

  beforeAll(async () => {
    client = postgres(url, { prepare: false, max: 1 });
    db = drizzle(client, { schema });
    await db
      .insert(schema.users)
      .values({
        email,
        emailCanonical: canonicalizeEmail(email),
        name: "Mint Test",
      })
      .onConflictDoNothing({ target: schema.users.emailCanonical });
  });

  afterAll(async () => {
    await client.end();
  });

  it("returns <cookieName>=<token> for a known user email", async () => {
    const out = await mintSession({ email, directDatabaseUrl: url });
    expect(out).toMatch(/^[a-z_]+=[A-Za-z0-9_-]+$/);
  });

  it("throws when user does not exist", async () => {
    await expect(
      mintSession({
        email: "nonexistent-xyz@example.com",
        directDatabaseUrl: url,
      }),
    ).rejects.toThrow(/not found/);
  });
});
