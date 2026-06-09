/**
 * Post-migrate assertion: prove the DB applied every migration the journal
 * declares, BY CONTENT HASH (identity, not just cardinality). Run AFTER
 * scripts/migrate.ts in the migrate workflow.
 *
 * Why hash identity, not count: the Drizzle migrator skips a journal entry
 * whose `when` is <= MAX(created_at), and a plain `count(*) >= expected` check
 * is fooled when a skipped migration is masked by an unrelated/duplicate/
 * hand-inserted row in drizzle.__drizzle_migrations (RUNBOOK §6.4/§6.6 sanction
 * manual row inserts). The migrator stores hash = sha256(<the .sql file text>);
 * we recompute the same hash per declared migration and require every one to be
 * present. A pure skip (count short) AND a masked skip (count ok, identity
 * wrong) both fail loudly.
 *
 * This runs as the migrate/owner role (DIRECT_DATABASE_URL) which owns the
 * `drizzle` schema, so it never hits the permission wall the /healthz runtime
 * canary works around (drizzle/0029_grant_drizzle_schema_read.sql). It is a
 * post-apply check: it never rolls back migrate.ts's work — a failure is a loud
 * signal, not a mutation.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import journal from "../drizzle/meta/_journal.json";
import postgres from "postgres";

const url = process.env["DIRECT_DATABASE_URL"];
if (!url) {
  console.error(
    "[assert-migrations] ERROR: DIRECT_DATABASE_URL is not set — cannot verify applied migrations.",
  );
  process.exit(1);
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}
const entries = (journal as { entries: JournalEntry[] }).entries;
const drizzleDir = fileURLToPath(new URL("../drizzle/", import.meta.url));

// Expected hash per migration = sha256 of the .sql file text, EXACTLY how the
// Drizzle migrator computes the hash it stores (see readMigrationFiles in
// node_modules/drizzle-orm/migrator.cjs).
const expected = entries.map((e) => ({
  tag: e.tag,
  hash: createHash("sha256")
    .update(readFileSync(`${drizzleDir}${e.tag}.sql`, "utf8"))
    .digest("hex"),
}));

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql<
    { hash: string }[]
  >`select hash from drizzle.__drizzle_migrations`;
  const applied = new Set(rows.map((r) => r.hash));
  const missing = expected.filter((m) => !applied.has(m.hash));

  if (missing.length > 0) {
    console.error(
      `[assert-migrations] FAIL: ${missing.length}/${expected.length} declared migration(s) NOT applied (by content hash): ` +
        `${missing.map((m) => m.tag).join(", ")}. ` +
        `${rows.length} rows present in drizzle.__drizzle_migrations. ` +
        `A migration was SKIPPED (non-monotonic journal \`when\` — see tests/unit/migration-journal-integrity.test.ts), ` +
        `or an applied migration's .sql drifted from what ran. See docs/RUNBOOK.md §6.6.`,
    );
    process.exit(1);
  }

  console.log(
    `[assert-migrations] OK: all ${expected.length} declared migrations present by content hash (${rows.length} rows in ledger).`,
  );
} finally {
  await sql.end();
}
