/**
 * Phase 9 Task 15 — archiveYear() + findUnarchivedClosedYearFiles() monitor.
 *
 * Tests use a swapped-in InMemoryMockFileStorage (via vi.mock of
 * "$lib/server/files/storage") so we never touch the local-fs root and don't
 * race with the other integration tests.
 *
 * Monotonic-forward trigger note: settings.festgeschrieben_bis only moves
 * forward when written by app_runtime (the test connection identity).
 * Resetting between tests therefore uses DIRECT_DATABASE_URL (postgres
 * superuser) — the trigger has a `session_user <> 'app_runtime'` short-circuit
 * that bypasses the check for non-runtime callers.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";

import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { getDb } from "$lib/server/db/index.js";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  seedFileViaAdmin,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

// Module-level mock state — replaced fresh in beforeEach so each test gets a
// clean blob store, and the mocked getFileStorage closure resolves to it.
let mockStorage: InMemoryMockFileStorage = new InMemoryMockFileStorage();

vi.mock("$lib/server/files/storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/server/files/storage.js")>();
  return {
    ...actual,
    getFileStorage: vi.fn(async () => mockStorage),
  };
});

// Imported AFTER the mock is registered.
const { archiveYear, findUnarchivedClosedYearFiles } =
  await import("$lib/server/files/archive-job.js");

// 64-char lowercase hex SHA. Stable per `n` for fixture diffability.
const SHA = (n: number) => "a".repeat(63) + n.toString(16);

// Superuser connection — bypasses the festgeschrieben_bis monotonic trigger
// (session_user check) so each test can reset to a clean state.
let admin: ReturnType<typeof postgres>;

const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DIRECT_DATABASE_URL.length > 0;

async function fkSafeCleanup() {
  // Superuser cleanup. Nulls FK refs in owner tables, then DELETEs files.
  // Bypasses the festgeschrieben_bis trigger (session_user check) so leftover
  // state from a prior describe-block can't block the wipe.
  await cleanupFilesViaAdmin();
}

async function clearFestgeschrieben() {
  // Use admin to bypass monotonic-forward + delete protections.
  await admin`
    INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
  `;
}

async function seedFile(opts: {
  id: string;
  storageKey: string;
  sha: string;
  uploadedAt?: string;
}) {
  // INSERT via the superuser helper — short-circuits both Festschreibung
  // triggers so the seed never collides with a leftover lock from a prior test.
  await seedFileViaAdmin({
    id: opts.id,
    storageKey: opts.storageKey,
    sha256: opts.sha,
    uploadedAt: opts.uploadedAt ?? "2025-06-01T10:00:00Z",
    originalFilename: opts.id + ".pdf",
    uploadedBySubmitterEmail: "s@x.de",
  });
  // Seed the corresponding blob into the in-memory mock so storage.archive()
  // can move it without StorageNotFoundError.
  await mockStorage.upload({
    buffer: new Uint8Array([1]),
    mimeType: "application/pdf",
    pathname: opts.storageKey,
  });
}

// Module-scoped admin lifecycle — shared across both describes so the second
// describe doesn't reuse an `.end()`-ed connection.
if (dbConfigured) {
  admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
}

describe.skipIf(!dbConfigured)("archiveYear", () => {
  afterAll(async () => {
    // Cross-file safety: reset the lock to JSONB null ("no lock") so later
    // test files (which may DELETE FROM files in their own beforeEach) don't
    // trip the Festschreibung trigger.
    await resetFestgeschreibungBis();
  });

  beforeEach(async () => {
    mockStorage = new InMemoryMockFileStorage();
    // Reset BEFORE fkSafeCleanup so any leftover Festschreibung state from a
    // prior test file can't block DELETE FROM files. Shared helper uses its
    // own superuser connection (bypasses both triggers).
    await resetFestgeschreibungBis();
    await clearFestgeschrieben();
    await fkSafeCleanup();
  });

  it("archives_unarchived_files_for_year", async () => {
    await seedFile({
      id: "00000000-0000-0000-0000-000000000001",
      storageKey: "belege/2025/x1.pdf",
      sha: SHA(1),
    });
    await seedFile({
      id: "00000000-0000-0000-0000-000000000002",
      storageKey: "belege/2025/x2.pdf",
      sha: SHA(2),
    });

    const r = await archiveYear(2025);
    expect(r.total).toBe(2);
    expect(r.archived).toBe(2);
    expect(r.failed).toBe(0);

    const rows = (await getDb().execute(sql`
      SELECT storage_key
        FROM files
       WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')
       ORDER BY storage_key
    `)) as unknown as Array<{ storage_key: string }>;
    expect(rows.map((row) => row.storage_key)).toEqual([
      "archived/belege/2025/x1.pdf",
      "archived/belege/2025/x2.pdf",
    ]);
  });

  it("archives_idempotently_when_dest_already_exists", async () => {
    await seedFile({
      id: "00000000-0000-0000-0000-000000000003",
      storageKey: "belege/2025/p.pdf",
      sha: SHA(3),
    });
    // First archive run.
    const r1 = await archiveYear(2025);
    expect(r1.archived).toBe(1);
    // Second run should be a no-op — candidates query filters out
    // already-archived storage_keys.
    const r2 = await archiveYear(2025);
    expect(r2.total).toBe(0);
    expect(r2.archived).toBe(0);
    expect(r2.failed).toBe(0);
  });

  it("archives_idempotently_when_source_already_gone", async () => {
    await seedFile({
      id: "00000000-0000-0000-0000-000000000004",
      storageKey: "belege/2025/q.pdf",
      sha: SHA(4),
    });
    await archiveYear(2025);
    const r2 = await archiveYear(2025);
    expect(r2.total).toBe(0);
    expect(r2.archived).toBe(0);
  });

  it("year_boundary_files_uploaded_at_dec31_2330_utc_belong_to_2026", async () => {
    // 2025-12-31T23:30:00Z = 2026-01-01T00:30 Europe/Berlin → year_for_booking() => 2026.
    await seedFile({
      id: "00000000-0000-0000-0000-000000000005",
      storageKey: "belege/2026/boundary.pdf",
      sha: SHA(5),
      uploadedAt: "2025-12-31T23:30:00Z",
    });
    const yearOf = (await getDb().execute(sql`
      SELECT year_of_buchung FROM files WHERE id = '00000000-0000-0000-0000-000000000005'
    `)) as unknown as Array<{ year_of_buchung: number }>;
    expect(yearOf[0]!.year_of_buchung).toBe(2026);

    const r = await archiveYear(2025);
    expect(r.total).toBe(0);
    const storageKey = (await getDb().execute(sql`
      SELECT storage_key FROM files WHERE id = '00000000-0000-0000-0000-000000000005'
    `)) as unknown as Array<{ storage_key: string }>;
    expect(storageKey[0]!.storage_key).toBe("belege/2026/boundary.pdf");
  });
});

describe.skipIf(!dbConfigured)(
  "findUnarchivedClosedYearFiles (monitor)",
  () => {
    afterAll(async () => {
      await clearFestgeschrieben();
      // Cross-file safety: leave the lock at JSONB null so subsequent test
      // files can DELETE FROM files freely without trigger interference.
      await resetFestgeschreibungBis();
      await closeAdminConnection();
      await admin.end();
    });

    beforeEach(async () => {
      mockStorage = new InMemoryMockFileStorage();
      await resetFestgeschreibungBis();
      await clearFestgeschrieben();
      await fkSafeCleanup();
    });

    it("returns_violations_when_files_exist_at_non_archived_paths_in_closed_years", async () => {
      await seedFile({
        id: "00000000-0000-0000-0000-000000000006",
        storageKey: "belege/2024/v.pdf",
        sha: SHA(6),
        uploadedAt: "2024-06-01T10:00:00Z",
      });
      // Close 2024 via admin (bypasses monotonic trigger).
      await admin`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2024'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = '2024'::jsonb
    `;

      const violations = await findUnarchivedClosedYearFiles();
      expect(violations.length).toBe(1);
      expect(violations[0]!.id).toBe("00000000-0000-0000-0000-000000000006");
    });

    it("returns_empty_after_clean_archiveYear_run", async () => {
      await seedFile({
        id: "00000000-0000-0000-0000-000000000007",
        storageKey: "belege/2024/v.pdf",
        sha: SHA(7),
        uploadedAt: "2024-06-01T10:00:00Z",
      });
      // Archive first (under no Festschreibung), then close. This matches the
      // production order (archive BEFORE closeBuchhaltungsjahr).
      await archiveYear(2024);
      await admin`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2024'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = '2024'::jsonb
    `;
      const violations = await findUnarchivedClosedYearFiles();
      expect(violations.length).toBe(0);
    });
  },
);
