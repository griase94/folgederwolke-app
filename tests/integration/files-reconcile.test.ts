/**
 * Phase 9 Task 16 — orphan reconciliation (manual; 48h age threshold).
 *
 * DATA-LOSS-CRITICAL. Three scenarios:
 *   1. blobs older than 48h with no matching DB row → quarantined
 *   2. DB rows with no matching blob → marked deleted (delete_reason='blob_missing')
 *   3. fresh upload (< 48h, no DB row) → left alone, NOT quarantined
 *
 * Uses the in-memory mock storage backend (swapped in via vi.mock) so we never
 * touch the local-fs root and don't race with other integration tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

let mockStorage: InMemoryMockFileStorage;
vi.mock("$lib/server/files/storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/server/files/storage.js")>();
  return { ...actual, getFileStorage: vi.fn(async () => mockStorage) };
});

const { reconcile } = await import("../../scripts/files-reconcile.js");

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DIRECT_DATABASE_URL.length > 0;

async function fkSafeCleanup() {
  const db = getDb();
  await db.execute(
    sql`UPDATE expenses              SET beleg_file_id = NULL WHERE beleg_file_id IS NOT NULL`,
  );
  await db.execute(
    sql`UPDATE income                SET beleg_file_id = NULL WHERE beleg_file_id IS NOT NULL`,
  );
  await db.execute(
    sql`UPDATE donations             SET beleg_file_id = NULL, bescheinigung_file_id = NULL WHERE beleg_file_id IS NOT NULL OR bescheinigung_file_id IS NOT NULL`,
  );
  await db.execute(
    sql`UPDATE auslagen_submissions  SET beleg_file_id = NULL WHERE beleg_file_id IS NOT NULL`,
  );
  await db.execute(sql`DELETE FROM files`);
}

describe.skipIf(!dbConfigured)("reconcile (48h age threshold)", () => {
  beforeEach(async () => {
    mockStorage = new InMemoryMockFileStorage();
    await fkSafeCleanup();
  });

  it("blobs older than 48h with no DB row → quarantined", async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000);
    // 2 orphans (no DB rows) — seeded directly into the map so we can backdate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStorage as any).store.set("belege/2026/orphan1.pdf", {
      bytes: new Uint8Array([1]),
      uploadedAt: oldTime,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockStorage as any).store.set("belege/2026/orphan2.pdf", {
      bytes: new Uint8Array([1]),
      uploadedAt: oldTime,
    });
    // 3 valid pairs (blob + matching DB row), blob backdated past threshold.
    for (let i = 1; i <= 3; i++) {
      const sha = "b".repeat(63) + i;
      await mockStorage.upload({
        buffer: new Uint8Array([i]),
        mimeType: "application/pdf",
        pathname: `belege/2026/valid${i}.pdf`,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockStorage as any).store.get(`belege/2026/valid${i}.pdf`).uploadedAt =
        oldTime;
      await getDb().execute(sql`
        INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
          original_filename, kind, source_kind, uploaded_by_submitter_email)
        VALUES (gen_random_uuid(), ${`belege/2026/valid${i}.pdf`}, 'blob', 'application/pdf',
          1, ${sha}, ${`v${i}.pdf`}, 'beleg', 'app', 'test@x.de')
      `);
    }

    const result = await reconcile();
    expect(result.quarantined).toBe(2);
    expect(result.orphansFound).toBe(2);
    expect(result.brokenRefs).toBe(0);
  });

  it("DB rows with no blob → marked deleted with delete_reason='blob_missing'", async () => {
    // 3 valid pairs.
    for (let i = 1; i <= 3; i++) {
      const sha = "c".repeat(63) + i;
      await mockStorage.upload({
        buffer: new Uint8Array([i]),
        mimeType: "application/pdf",
        pathname: `belege/2026/ok${i}.pdf`,
      });
      await getDb().execute(sql`
        INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
          original_filename, kind, source_kind, uploaded_by_submitter_email)
        VALUES (gen_random_uuid(), ${`belege/2026/ok${i}.pdf`}, 'blob', 'application/pdf',
          1, ${sha}, ${`o${i}.pdf`}, 'beleg', 'app', 'test@x.de')
      `);
    }
    // 2 DB rows with no matching blob.
    for (let i = 1; i <= 2; i++) {
      const sha = "d".repeat(63) + i;
      await getDb().execute(sql`
        INSERT INTO files (id, storage_key, storage_backend, mime_type, byte_size, sha256,
          original_filename, kind, source_kind, uploaded_by_submitter_email)
        VALUES (gen_random_uuid(), ${`belege/2026/missing${i}.pdf`}, 'blob', 'application/pdf',
          1, ${sha}, ${`m${i}.pdf`}, 'beleg', 'app', 'test@x.de')
      `);
    }
    const result = await reconcile();
    expect(result.brokenRefs).toBe(2);
    const marked = (await getDb().execute(sql`
      SELECT count(*)::int AS c FROM files
      WHERE delete_reason = 'blob_missing' AND deleted_at IS NOT NULL
    `)) as unknown as Array<{ c: number }>;
    expect(marked[0]!.c).toBe(2);
  });

  it("fresh upload (under 48h) → NOT quarantined", async () => {
    // Fresh blob with no DB row — uploadedAt is `now()`, well under 48h.
    await mockStorage.upload({
      buffer: new Uint8Array([1]),
      mimeType: "application/pdf",
      pathname: "belege/2026/fresh.pdf",
    });
    const result = await reconcile();
    expect(result.quarantined).toBe(0);
    expect(result.orphansFound).toBe(0);
  });
});
