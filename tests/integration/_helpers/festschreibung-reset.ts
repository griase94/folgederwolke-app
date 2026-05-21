/**
 * Phase 9 test-suite helper: reset `settings.festgeschrieben_bis` between
 * integration tests so DELETE FROM files never trips the Festschreibung
 * trigger.
 *
 * Why this exists
 * ===============
 * `vitest.config.ts` runs the whole suite in ONE process (`pool: "forks"`,
 * `singleFork: true`), so any DB state left behind by an earlier test file
 * leaks into the next. Phase 9 introduces two interacting triggers on
 * `settings.festgeschrieben_bis`:
 *
 *   1. A monotonic-forward UPDATE guard (app_runtime can only move the year
 *      forward).
 *   2. `assert_not_festgeschrieben_fn_files` on the `files` table, which
 *      rejects DELETE/UPDATE on rows whose `year_of_buchung <= festgeschrieben_bis`.
 *
 * Both triggers short-circuit when `session_user <> 'app_runtime'`. So a
 * postgres-role connection (DIRECT_DATABASE_URL) can reset the lock without
 * tripping either trigger, regardless of the prior value.
 *
 * Calling `resetFestgeschreibungBis()` at the start of `beforeEach` (before
 * the FK-safe cleanup that DELETEs from `files`) guarantees no leftover
 * "2024" value from a previous test file blocks the cleanup.
 *
 * Implementation note: we set the value to JSONB `null` — semantically "no
 * lock". The tolerant year extractor returns NULL for that shape, and the
 * monotonic trigger explicitly treats `NULL → year` as the "first-ever
 * Festschreibung" path (always allowed for app_runtime). This keeps the
 * trigger's forward-only invariant intact for tests that follow ours, such
 * as `tests/unit/tier-1-prod-hardening.test.ts` — which UPSERTs values like
 * 2024 via app_runtime and would fail if we'd left a sentinel year like 9999
 * behind. Tests that explicitly need a closed year (e.g. the trigger test in
 * `files-schema.test.ts`) still set their own value via superuser.
 */
import postgres from "postgres";

let _admin: ReturnType<typeof postgres> | null = null;

function admin(): ReturnType<typeof postgres> {
  if (_admin) return _admin;
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url || url.length === 0) {
    throw new Error(
      "DIRECT_DATABASE_URL required for festschreibung-reset helper",
    );
  }
  _admin = postgres(url, { prepare: false, max: 1 });
  return _admin;
}

/**
 * Reset `settings.festgeschrieben_bis` to JSONB `null` ("no lock") using a
 * superuser connection that bypasses both the monotonic-forward trigger and
 * the `assert_not_festgeschrieben_fn_files` trigger. Use in `beforeEach` to
 * guarantee a clean state regardless of what a prior test file left behind.
 *
 * Idempotent: safe to call repeatedly. If the row doesn't exist yet this
 * INSERTs it; otherwise UPDATEs it.
 */
export async function resetFestgeschreibungBis(): Promise<void> {
  const a = admin();
  await a`
    INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
  `;
}

/**
 * Tear down the module-level admin connection. Call from `afterAll` in any
 * test file that imports `resetFestgeschreibungBis` so the connection pool
 * doesn't keep vitest hanging on process exit.
 *
 * Safe to call multiple times.
 */
export async function closeAdminConnection(): Promise<void> {
  if (_admin) {
    await _admin.end();
    _admin = null;
  }
}
