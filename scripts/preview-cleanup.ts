#!/usr/bin/env tsx
/**
 * Best-effort cleanup of e2e-namespaced rows in the preview Neon branch.
 *
 * Deletes rows whose user-visible identifiers begin with the e2e namespace
 * for the given E2E_RUN_ID. NEVER deletes the baseline e2e-admin user.
 * NEVER touches audit_log (ADR-0004 append-only).
 *
 * Namespace patterns (from tests/e2e/lib/run-id.ts):
 *   nsLabel(x) → "e2e-{runId}-{x}"  — used in vorname, nachname, bezeichnung
 *   nsEmail(x) → "e2e+{runId}+{x}@folgederwolke.de"  — used in email fields
 *
 * FK ordering: expenses reference members (bezahlt_von_member_id, set null on
 * delete) and files (beleg_file_id, restrict on delete). We delete expenses
 * first to clear the restrict FK, then members (which cascade-deletes
 * member_beitrags). Files are not cleaned: original_filename is not
 * namespaced, and no e2e-per-run user is written to the uploaded_by_* columns.
 *
 * Safety: refuses to run unless DIRECT_DATABASE_URL contains "preview"
 * (matches the Neon preview-branch host pattern). Set ALLOW_NON_PREVIEW_CLEANUP=1
 * to override (local docker dev).
 *
 * Best-effort: ALWAYS exits 0. Any DB error is logged to stderr. The GH
 * Actions workflow uses continue-on-error too; this is belt + suspenders so
 * cleanup never blocks the e2e gate.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema/index.js";

async function main() {
  const runId = process.env["E2E_RUN_ID"];
  if (!runId || runId === "local") {
    console.log("skip: no E2E_RUN_ID");
    return;
  }

  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) {
    console.error("DIRECT_DATABASE_URL required (best-effort — exiting 0)");
    return;
  }

  if (!process.env["ALLOW_NON_PREVIEW_CLEANUP"] && !url.includes("preview")) {
    console.error(
      "skip: DIRECT_DATABASE_URL does not contain 'preview' — refusing to clean.",
    );
    return;
  }

  // nsLabel(x) produces "e2e-{runId}-{x}", so prefix is "e2e-{runId}-"
  const labelPrefix = `e2e-${runId}-%`;
  // nsEmail(x) produces "e2e+{runId}+{x}@folgederwolke.de", so prefix is "e2e+{runId}+"
  const emailPrefix = `e2e+${runId}+%`;

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    // 1. Expenses: bezeichnung carries the nsLabel value.
    //    Delete before members because beleg_file_id → files uses ON DELETE RESTRICT.
    await db.execute(sql`
      DELETE FROM expenses
      WHERE bezeichnung LIKE ${labelPrefix}
    `);

    // 2. Income: bezeichnung carries the nsLabel value (symmetric to expenses).
    await db.execute(sql`
      DELETE FROM income
      WHERE bezeichnung LIKE ${labelPrefix}
    `);

    // 3. Members: vorname or email carries the namespace.
    //    member_beitrags rows are cascade-deleted (ON DELETE CASCADE on member_id).
    await db.execute(sql`
      DELETE FROM members
      WHERE vorname LIKE ${labelPrefix}
         OR email LIKE ${emailPrefix}
    `);

    // 4. Users: email carries the namespace.
    //    Never delete the baseline e2e-admin user (used by seed-preview.ts).
    await db.execute(sql`
      DELETE FROM users
      WHERE email LIKE ${emailPrefix}
        AND email <> 'e2e-admin@folgederwolke.de'
    `);

    // 5. Sent mails: to_canonical carries the canonicalized recipient email.
    //    Note: to_canonical is the canonicalized form (e.g. lowercase, dots stripped
    //    for Gmail). The nsEmail pattern uses "+" which survives canonicalization.
    await db.execute(sql`
      DELETE FROM sent_mails
      WHERE to_canonical LIKE ${emailPrefix}
    `);

    console.log(`cleanup ok for runId=${runId}`);
  } catch (e) {
    console.error("cleanup failed:", e);
  } finally {
    await client.end();
  }
}

main()
  .catch((e) => {
    console.error("unexpected error:", e);
  })
  .finally(() => {
    process.exit(0);
  });
