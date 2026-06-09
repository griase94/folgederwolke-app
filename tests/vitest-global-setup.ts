/**
 * Vitest globalSetup — runs ONCE before all unit tests in the main process,
 * before any worker fork. Loads .env.test into process.env, then builds a
 * migrated + seeded TEMPLATE database (folgederwolke_test_tmpl) exactly once.
 *
 * Each test file then runs in its own fork (pool:"forks", isolate:true) and
 * the per-file setup tests/setup/per-worker-db.ts clones a fresh DB from that
 * template (a fast file-copy) and repoints DATABASE_URL at it. That makes the
 * suite parallel AND order-independent — no shared-DB cross-file leakage.
 *
 * reset-test-db.sh honours RESET_DB_NAME to retarget its drop/create/migrate/
 * seed at the template. The teardown returned here drops the template and any
 * leftover per-worker clone DBs so a run leaves no stray databases behind.
 */

import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const TEMPLATE_DB = "folgederwolke_test_tmpl";

/** Swap the database path segment (preserving any ?query) of a postgres URL. */
function withDatabase(url: string, db: string): string {
  return url.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
}

export default function setup() {
  loadEnv({ path: ".env.test" });
  // Per-slot worktree isolation (Pre-Flight Task 0.9): if .env.test.local sets
  // DATABASE_URL=…_slotN, load it on top so the template + worker clones live
  // on the same DB host the reset script just initialised.
  loadEnv({ path: ".env.test.local", override: true });

  console.log("[vitest-global-setup] building template test DB...");
  execFileSync("bash", ["scripts/db/reset-test-db.sh"], {
    stdio: "inherit",
    env: { ...process.env, RESET_DB_NAME: TEMPLATE_DB },
  });

  // Async teardown: drop every per-worker clone + the template so the cluster
  // is left clean. DROP … WITH (FORCE) (PG13+) evicts any straggler session.
  return async () => {
    const base =
      process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];
    if (!base) return;
    const admin = postgres(withDatabase(base, "postgres"), {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    try {
      const rows = await admin<{ datname: string }[]>`
        SELECT datname FROM pg_database
        WHERE datname LIKE 'folgederwolke_test_w%'
      `;
      for (const { datname } of rows) {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
      }
      await admin.unsafe(
        `DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`,
      );
    } finally {
      await admin.end({ timeout: 5 });
    }
  };
}
