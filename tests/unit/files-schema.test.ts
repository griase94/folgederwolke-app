/**
 * Phase 9 — schema migrations 0015 + 0016.
 *
 * These tests are intentionally low-level (raw SQL via drizzle.execute) and
 * verify the wire-level shape of the new `files` table: columns, enum
 * extension, CHECK constraints, FK delete-rule, and the Festschreibung
 * trigger that mirrors 0014's pattern but reads `uploaded_at` instead of
 * `gebucht_am` (files has no `gebucht_am`).
 *
 * Notes on the test driver:
 *   `db.execute(sql\`…\`)` from drizzle-orm/postgres-js returns the rows
 *   ARRAY directly (array-like, not `{rows: [...]}`). Postgres errors come
 *   through as `Error("Failed query: …", { cause: PostgresError })`, so the
 *   constraint name lives on `err.cause.message` / `err.cause.constraint_name`.
 *   We pattern-match against `.cause.message` to verify the right constraint
 *   fired (matching what's in the messages from `postgres@3.x`).
 */
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

/** Capture the postgres-side message (lives on err.cause.message, not err.message). */
async function pgErrMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err: unknown) {
    const e = err as { cause?: { message?: string }; message?: string };
    return e.cause?.message ?? e.message ?? "";
  }
  throw new Error("expected promise to reject");
}

describe("files table schema (0015 + 0016)", () => {
  it("columns exist", async () => {
    const rows = (await getDb().execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'files' ORDER BY ordinal_position
    `)) as unknown as Array<{ column_name: string }>;
    const names = rows.map((r) => r.column_name);
    for (const c of [
      "id",
      "storage_key",
      "storage_backend",
      "mime_type",
      "byte_size",
      "sha256",
      "original_filename",
      "kind",
      "thumbnail_storage_key",
      "uploaded_at",
      "uploaded_by_user_id",
      "uploaded_by_submitter_email",
      "deleted_at",
      "delete_reason",
      "source_kind",
      "year_of_buchung",
    ])
      expect(names).toContain(c);
  });

  it("entityKindEnum includes 'file'", async () => {
    const rows = (await getDb().execute(
      sql`SELECT unnest(enum_range(NULL::entity_kind))::text AS v`,
    )) as unknown as Array<{ v: string }>;
    expect(rows.map((x) => x.v)).toContain("file");
  });

  it("rejects both uploaded_by columns NULL", async () => {
    const msg = await pgErrMessage(
      getDb().execute(sql`
        INSERT INTO files (storage_key, storage_backend, mime_type, byte_size, sha256,
          original_filename, kind, source_kind)
        VALUES ('belege/2026/x.pdf','blob','application/pdf',100,
          repeat('a', 64),'x.pdf','beleg','app')
      `),
    );
    expect(msg).toMatch(/files_uploaded_by_one_of/);
  });

  it("FK columns ON DELETE RESTRICT", async () => {
    const rows = (await getDb().execute(sql`
      SELECT tc.table_name, kcu.column_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu USING (constraint_name)
      JOIN information_schema.referential_constraints rc USING (constraint_name)
      WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name LIKE '%_file_id'
    `)) as unknown as Array<{
      table_name: string;
      column_name: string;
      delete_rule: string;
    }>;
    const targets = rows.map(
      (r) => `${r.table_name}.${r.column_name}=${r.delete_rule}`,
    );
    for (const t of [
      "expenses.beleg_file_id=RESTRICT",
      "income.beleg_file_id=RESTRICT",
      "donations.beleg_file_id=RESTRICT",
      "donations.bescheinigung_file_id=RESTRICT",
      "auslagen_submissions.beleg_file_id=RESTRICT",
    ])
      expect(targets).toContain(t);
  });

  it("Festschreibung trigger rejects UPDATE on closed-year file", async () => {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
        original_filename, kind, source_kind, uploaded_at, uploaded_by_submitter_email)
      VALUES ('00000000-0000-0000-0000-000000000099','belege/2024/test.pdf','blob',
        'application/pdf', 100, repeat('a', 64), 'x.pdf', 'beleg', 'app',
        '2024-06-01T10:00:00Z', 'test@x.de')
    `);
    // settings.value is jsonb; 0014's tolerant extractor handles bare numbers.
    await db.execute(sql`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2024'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = '2024'::jsonb
    `);
    const msg = await pgErrMessage(
      db.execute(sql`
        UPDATE files SET storage_key = 'belege/2024/changed.pdf'
        WHERE id = '00000000-0000-0000-0000-000000000099'
      `),
    );
    expect(msg).toMatch(/[Ff]estgeschrieben/);

    // Cleanup via superuser connection. The Festschreibung trigger short-circuits
    // when `session_user <> 'app_runtime'`, and the settings monotonic-forward
    // trigger likewise bypasses for superuser — so DIRECT_DATABASE_URL can both
    // reset the lock and drop the test row without re-tripping either trigger.
    const admin = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    try {
      await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
      await admin`DELETE FROM files WHERE id = '00000000-0000-0000-0000-000000000099'`;
    } finally {
      await admin.end();
    }
  });
});
