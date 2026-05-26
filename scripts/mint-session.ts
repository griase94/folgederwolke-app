#!/usr/bin/env tsx
/**
 * Mints a session cookie via the same code path the magic-link flow uses
 * (auth.issueSession). Bypasses SMTP, exercises the real sessions table.
 *
 * Output: `<cookieName>=<value>` printed to stdout. The GH Actions
 * preview-e2e workflow pipes this into Playwright context.addCookies().
 *
 * Safety: refuses to run unless DIRECT_DATABASE_URL contains "preview"
 * (matches the Neon preview-branch host pattern). Set ALLOW_NON_PREVIEW_MINT=1
 * to override (local docker dev).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema/index.js";
import { issueSession } from "../src/lib/server/auth/issue-session.js";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/cookie-names.js";

export interface MintOpts {
  email: string;
  directDatabaseUrl: string;
}

export async function mintSession(opts: MintOpts): Promise<string> {
  const client = postgres(opts.directDatabaseUrl, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    const [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, opts.email));
    if (!u) {
      throw new Error(
        `user ${opts.email} not found — run scripts/seed-preview.ts first`,
      );
    }
    const { token } = await issueSession(db, u.id);
    return `${SESSION_COOKIE_NAME}=${token}`;
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) {
    console.error("ERROR: DIRECT_DATABASE_URL required.");
    process.exit(1);
  }
  if (!process.env["ALLOW_NON_PREVIEW_MINT"] && !url.includes("preview")) {
    console.error(
      "ERROR: refusing to mint — DIRECT_DATABASE_URL does not contain 'preview'.",
    );
    console.error(
      "Set ALLOW_NON_PREVIEW_MINT=1 to override (use only for local docker dev).",
    );
    process.exit(1);
  }
  const out = await mintSession({
    email: process.env["E2E_ADMIN_EMAIL"] || "e2e-admin@folgederwolke.de",
    directDatabaseUrl: url,
  });
  process.stdout.write(out);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
