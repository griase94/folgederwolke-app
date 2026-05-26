import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/server/db/schema/index.js";
import { mintSession } from "./mint-session.js";
import { canonicalizeEmail } from "../src/lib/domain/email.js";
import { unsign } from "../src/lib/server/auth/cookie-sign.js";

const url =
  process.env["DATABASE_URL"] ||
  "postgres://app_runtime:app_runtime@127.0.0.1:15432/folgederwolke_test";

const TEST_SECRET = "test-secret-abc";

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

  it("returns <cookieName>=<signed-cookie> for a known user email", async () => {
    const out = await mintSession({
      email,
      directDatabaseUrl: url,
      secret: TEST_SECRET,
    });
    // Signed cookie: <token>.<hex-sig> — so `=` separator splits into name + value
    expect(out).toMatch(/^[a-z_]+=[A-Za-z0-9_-]+\.[a-f0-9]+$/);
  });

  it("round-trips: unsign(cookieValue, secret) returns a base64url token", async () => {
    const out = await mintSession({
      email,
      directDatabaseUrl: url,
      secret: TEST_SECRET,
    });
    const eq = out.indexOf("=");
    const cookieValue = out.slice(eq + 1);

    const rawToken = unsign(cookieValue, TEST_SECRET);
    expect(rawToken).not.toBeNull();
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("unsign with a different secret returns null", async () => {
    const out = await mintSession({
      email,
      directDatabaseUrl: url,
      secret: TEST_SECRET,
    });
    const eq = out.indexOf("=");
    const cookieValue = out.slice(eq + 1);

    expect(unsign(cookieValue, "wrong-secret")).toBeNull();
  });

  it("throws when user does not exist", async () => {
    await expect(
      mintSession({
        email: "nonexistent-xyz@example.com",
        directDatabaseUrl: url,
        secret: TEST_SECRET,
      }),
    ).rejects.toThrow(/not found/);
  });
});
