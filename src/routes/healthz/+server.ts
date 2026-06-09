import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { getSheetsClient } from "$lib/server/drive/sheets-client.js";
import { getFileStorage } from "$lib/server/files/storage.js";
import { expectedMigrationCount } from "$lib/server/db/migration-status.js";
import { env } from "$lib/server/env.js";

interface MigrationStatus {
  /** Rows in drizzle.__drizzle_migrations, or -1 if the query failed. */
  applied: number;
  /** Migrations the deployed bundle was built against. */
  expected: number;
  /** false when prod is BEHIND the deployed code (a migration was skipped). */
  ok: boolean;
}

interface HealthState {
  db: "ok" | "fail";
  sheets: "ok" | "fail";
  blob: "ok" | "fail";
  migrations: MigrationStatus;
}

// Module-level guard prevents upload storm if probe is missing AND /healthz
// is polled aggressively (UptimeRobot, monitoring, DDoS).
let probeSeeded = false;

// Phase 9 review-1 P1: cache the assembled health response so frequent
// monitoring polls (UptimeRobot, internal probes) don't cause one DB + one
// Sheets RPC + one Blob download per second. 30s TTL is short enough that
// real outages surface within a useful SLA, long enough to absorb high-fanout
// monitoring without piling work onto Fluid Compute.
interface CachedResult {
  body: string;
  status: number;
  at: number;
}
let lastResult: CachedResult | null = null;
const TTL_MS = 30_000;

async function check(): Promise<HealthState> {
  const db = await getDb()
    .execute(sql`SELECT 1`)
    .then(() => "ok" as const)
    .catch(() => "fail" as const);

  let sheets: "ok" | "fail" = "fail";
  if (env.googleServiceAccount && env.FINANCE_SHEET_ID) {
    try {
      const client = getSheetsClient();
      await client.spreadsheets.get({
        spreadsheetId: env.FINANCE_SHEET_ID,
        fields: "spreadsheetId",
      });
      sheets = "ok";
    } catch {
      sheets = "fail";
    }
  }

  // Schema canary: how many migrations are applied vs. how many the deployed
  // bundle expects. Catches the silent-skip class (PR #92) post-deploy. -1 on
  // any query failure (table missing / DB down) so `ok` is conservatively false.
  let migrations: MigrationStatus = {
    applied: -1,
    expected: expectedMigrationCount,
    ok: false,
  };
  try {
    const rows = (await getDb().execute(
      sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
    )) as unknown as Array<{ applied: number }>;
    const applied = Number(rows[0]?.applied ?? -1);
    migrations = {
      applied,
      expected: expectedMigrationCount,
      ok: applied >= expectedMigrationCount,
    };
  } catch {
    // leave the conservative { applied: -1, ok: false } default
  }

  let blob: "ok" | "fail" = "fail";
  try {
    const storage = await getFileStorage();
    try {
      await storage.download("healthz-probe.txt");
      blob = "ok";
      probeSeeded = true;
    } catch {
      // Self-heal ONCE per process. After first success or attempt, never
      // re-upload — even if the probe is genuinely missing on a subsequent
      // failure, a real error (transient network, missing token) is fail-fast.
      if (!probeSeeded) {
        try {
          await storage.upload({
            buffer: new Uint8Array([0x20]),
            mimeType: "text/plain",
            pathname: "healthz-probe.txt",
          });
          probeSeeded = true;
          blob = "ok";
        } catch {
          try {
            await storage.download("healthz-probe.txt");
            blob = "ok";
            probeSeeded = true;
          } catch {
            blob = "fail";
          }
        }
      }
    }
  } catch {
    blob = "fail";
  }

  return { db, sheets, blob, migrations };
}

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (lastResult && now - lastResult.at < TTL_MS) {
    return new Response(lastResult.body, {
      status: lastResult.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Healthz-Cached": "1",
      },
    });
  }

  const state = await check();

  // Vercel injects `VERCEL_GIT_COMMIT_SHA` at runtime — prefer it over
  // `env.COMMIT_SHA` because the latter defaults to the literal string
  // `"dev"` in `env.ts`. Without this precedence order the fallback chain
  // would always short-circuit to `"dev"` (since the default is truthy),
  // and the post-deploy smoke workflow — which compares the deployed git
  // SHA against this field — would never match. Local dev (no Vercel env
  // vars set) falls through to `env.COMMIT_SHA = "dev"`.
  const sha =
    process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ||
    env.COMMIT_SHA ||
    "dev";

  const body = JSON.stringify({
    ...state,
    sha,
    deployedAt: env.DEPLOYED_AT || null,
  });

  // Preserve existing always-200 contract so monitoring + existing E2E note()s
  // keep working. Health state is encoded in the JSON body's per-subsystem
  // fields ("ok"|"fail"), and operators read the body. Flipping the status
  // code on subsystem failures would be a separate semantic change.
  const status = 200;
  lastResult = { body, status, at: now };

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
