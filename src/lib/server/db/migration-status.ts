// Schema canary support for /healthz.
//
// The deployed bundle inlines the migration journal at build time (static JSON
// import → Rollup constant), so `expectedMigrationCount` is "how many
// migrations this code was built against". /healthz compares it to the count
// actually applied in drizzle.__drizzle_migrations. When prod is BEHIND
// (a migration silently skipped — see migration-journal-integrity.test.ts for
// the failure mode), applied < expected and the canary reports not-ok, which
// post-deploy-smoke turns into a loud deploy failure.

import journal from "../../../../drizzle/meta/_journal.json";

interface JournalShape {
  entries: { idx: number; tag: string; when: number }[];
}

const j = journal as JournalShape;

/** Number of migrations this deployed code expects to have been applied. */
export const expectedMigrationCount: number = j.entries.length;

/** Tag of the latest migration this deployed code carries (for diagnostics). */
export const latestMigrationTag: string =
  j.entries[j.entries.length - 1]?.tag ?? "";
