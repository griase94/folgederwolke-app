/**
 * Standalone issueSession helper — no SvelteKit / $lib imports so it can
 * also be called from Node scripts (e.g. scripts/mint-session.ts).
 */

import { randomBytes } from "node:crypto";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sessions } from "../db/schema/users.js";
import { sha256 } from "./hash.js";

// Structural type: accepts any drizzle db or transaction that can insert.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionWriter = Pick<PostgresJsDatabase<any>, "insert">;

/**
 * Mint a fresh session row for `userId` and return the raw token.
 *
 * Caller is responsible for setting the session cookie (this helper has no
 * access to `cookies`). TTL matches the magic-link flow: 30 days absolute.
 */
export async function issueSession(
  dbOrTx: SessionWriter,
  userId: string,
): Promise<{ token: string }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const now = new Date();
  await dbOrTx.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt: new Date(now.getTime() + 30 * 86400_000),
    lastUsedAt: now,
  });
  return { token };
}
