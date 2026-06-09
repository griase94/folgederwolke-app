/**
 * Post-migrate assertion: prove the DB actually applied every migration the
 * journal declares. Run AFTER scripts/migrate.ts in the migrate workflow.
 *
 * Why this exists (replaces a false-confidence "re-run migrate, expect no-op"
 * check): the Drizzle migrator skips a journal entry whose `when` is <= the
 * current MAX(created_at) in drizzle.__drizzle_migrations. A wrongly-ordered
 * entry is therefore silently skipped — and re-running migrate skips it
 * *again* with the same green no-op, so "re-run is a no-op" proved nothing.
 * Counting applied-vs-declared catches the skip directly and loudly.
 *
 * Runs as the migrate/owner role (DIRECT_DATABASE_URL), which owns the
 * `drizzle` schema, so it never hits the permission wall the runtime canary
 * works around (see drizzle/0029_grant_drizzle_schema_read.sql).
 */
import journal from "../drizzle/meta/_journal.json";
import postgres from "postgres";

const url = process.env["DIRECT_DATABASE_URL"];
if (!url) {
  console.error(
    "[assert-migrations] ERROR: DIRECT_DATABASE_URL is not set — cannot verify applied migrations.",
  );
  process.exit(1);
}

const expected = (journal as { entries: unknown[] }).entries.length;

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql<{ applied: number }[]>`
    select count(*)::int as applied from drizzle.__drizzle_migrations
  `;
  const applied = Number(rows[0]?.applied ?? -1);

  if (applied < expected) {
    console.error(
      `[assert-migrations] FAIL: ${applied} migrations applied but the journal declares ${expected}. ` +
        `At least one migration was SKIPPED — almost always a non-monotonic \`when\` in ` +
        `drizzle/meta/_journal.json (the migrator only applies entries with when > MAX(created_at)). ` +
        `See tests/unit/migration-journal-integrity.test.ts and docs/RUNBOOK.md.`,
    );
    process.exit(1);
  }

  console.log(
    `[assert-migrations] OK: ${applied}/${expected} declared migrations are applied.`,
  );
} finally {
  await sql.end();
}
