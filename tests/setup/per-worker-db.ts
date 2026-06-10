// tests/setup/per-worker-db.ts
//
// Per-worker Postgres isolation for the reset-lane (DB) suite.
//
// vitest runs each test file in its own fork (pool:"forks", isolate:true → the
// module registry, incl. db/index.ts's lazy `_client`, is fresh per file).
// This setup file — registered FIRST in vitest.config.ts setupFiles — runs
// before any test code and clones a brand-new database from the migrated +
// seeded TEMPLATE (built once by vitest-global-setup), then repoints
// DATABASE_URL / DIRECT_DATABASE_URL / FILE_STORAGE_ROOT at it BEFORE the lazy
// getClient() / env.ts read their first value.
//
// Result: every test file gets a pristine clone of the showcase corpus → files
// run in PARALLEL forks and can never observe or mutate each other's data, so
// the suite is order-independent (no cross-file leakage) on any platform.
//
// DBs are named by the reused worker slot (VITEST_POOL_ID), so at most
// `maxForks` clone DBs exist at once; each is dropped + recloned at the start of
// every file that lands in that slot. Stale slot DBs are dropped in
// vitest-global-setup's teardown.
import { mkdirSync, rmSync } from "node:fs";
import postgres from "postgres";

const TEMPLATE_DB = "folgederwolke_test_tmpl";

/** Swap the database path segment (preserving any ?query) of a postgres URL. */
function withDatabase(url: string, db: string): string {
  return url.replace(/\/[^/?]+(\?.*)?$/, `/${db}$1`);
}

// CREATE/DROP DATABASE require a role with CREATEDB. The app connection
// (DATABASE_URL) runs as the limited `app_runtime` role, which has none — so
// admin ops MUST go through the superuser DIRECT_DATABASE_URL. Fall back to
// DATABASE_URL only if DIRECT is unset (then it had better be a superuser).
const adminBase =
  process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];

// No DB configured (e.g. a stray run without .env.test) → leave env as-is; the
// DB-touching tests guard on `dbConfigured` and skip.
if (adminBase) {
  const slot = process.env["VITEST_POOL_ID"] ?? "1";
  const workerDb = `folgederwolke_test_w${slot}`;

  const admin = postgres(withDatabase(adminBase, "postgres"), {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  try {
    // FORCE terminates any straggler connection from a prior file in this slot.
    await admin.unsafe(`DROP DATABASE IF EXISTS "${workerDb}" WITH (FORCE)`);
    // TEMPLATE copy is a fast file-level clone and carries the table-level
    // GRANTs (so app_runtime keeps its privileges on the cloned tables).
    await admin.unsafe(
      `CREATE DATABASE "${workerDb}" TEMPLATE "${TEMPLATE_DB}"`,
    );
  } finally {
    await admin.end({ timeout: 5 });
  }

  // Repoint BOTH urls at the freshly-cloned worker DB, preserving each url's
  // own credentials (app_runtime for DATABASE_URL, postgres for DIRECT).
  if (process.env["DATABASE_URL"]) {
    process.env["DATABASE_URL"] = withDatabase(
      process.env["DATABASE_URL"],
      workerDb,
    );
  }
  if (process.env["DIRECT_DATABASE_URL"]) {
    process.env["DIRECT_DATABASE_URL"] = withDatabase(
      process.env["DIRECT_DATABASE_URL"],
      workerDb,
    );
  }

  // Per-worker on-disk file-storage root so local-fs file tests don't collide.
  const fileRoot = `./.dev-data/files-test-w${slot}`;
  rmSync(fileRoot, { recursive: true, force: true });
  mkdirSync(fileRoot, { recursive: true });
  process.env["FILE_STORAGE_ROOT"] = fileRoot;
}
