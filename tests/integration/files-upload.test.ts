/**
 * Phase 9 Task 11 — upload pipeline integration tests.
 *
 * Verifies the blob-first / DB-second pipeline that backs the public
 * Auslage form:
 *   - blob upload failure → no `files` row (Phase A failure)
 *   - sequential identical uploads → dedup hit
 *   - concurrent identical uploads → exactly one `files` row
 *     (Postgres unique_violation retry path)
 *   - MIME mismatch + size cap rejections (Phase 0 validation)
 *   - thumbnail failure is non-fatal (image row written w/o thumbnail key)
 *   - HEIC skips thumbnail generation entirely
 *
 * Driver notes:
 *   drizzle-orm/postgres-js `db.execute(sql\`…\`)` returns rows as a
 *   plain array (not `{rows}`). All assertions read `arr[0].col` directly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChaosFileStorage } from "$lib/server/files/chaos-impl.js";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { handleAuslageUpload } from "$lib/server/files/upload-pipeline.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

async function rowCount(query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await getDb().execute(query)) as unknown as Array<{
    c: number;
  }>;
  return rows[0]?.c ?? 0;
}

describe("upload pipeline", () => {
  beforeEach(async () => {
    // FK-safe cleanup: null FK refs in all four owner tables, then DELETE files.
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
    await db.execute(sql`DELETE FROM auslagen_submissions`);
    await db.execute(sql`DELETE FROM files`);
  });

  it("blob upload failure → no files row", async () => {
    const inner = new InMemoryMockFileStorage();
    const chaos = new ChaosFileStorage(inner);
    chaos.failNextUpload(1);
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    await expect(
      handleAuslageUpload({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "t.pdf",
        submitterEmail: "a@b.de",
        storage: chaos,
      }),
    ).rejects.toThrow(/CHAOS/);
    expect(await rowCount(sql`SELECT count(*)::int AS c FROM files`)).toBe(0);
  });

  it("sequential identical → same fileId, dedupHit on 2nd", async () => {
    const inner = new InMemoryMockFileStorage();
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    const r1 = await handleAuslageUpload({
      bytes,
      claimedMime: "application/pdf",
      originalFilename: "t1.pdf",
      submitterEmail: "a@b.de",
      storage: inner,
    });
    const r2 = await handleAuslageUpload({
      bytes,
      claimedMime: "application/pdf",
      originalFilename: "t2.pdf",
      submitterEmail: "a@b.de",
      storage: inner,
    });
    expect(r1.dedupHit).toBe(false);
    expect(r2.dedupHit).toBe(true);
    expect(r2.fileId).toBe(r1.fileId);
  });

  it("PARALLEL identical → exactly 1 files row", async () => {
    const inner = new InMemoryMockFileStorage();
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    const [r1, r2] = await Promise.all([
      handleAuslageUpload({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "a.pdf",
        submitterEmail: "x@y.de",
        storage: inner,
      }),
      handleAuslageUpload({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "b.pdf",
        submitterEmail: "x@y.de",
        storage: inner,
      }),
    ]);
    expect(r1.fileId).toBe(r2.fileId);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(
      await rowCount(
        sql`SELECT count(*)::int AS c FROM files WHERE sha256 = ${sha}`,
      ),
    ).toBe(1);
  });

  it("rejects MIME mismatch", async () => {
    const inner = new InMemoryMockFileStorage();
    // PNG magic bytes (89 50 4e 47 0d 0a 1a 0a) — file-type sniffs as image/png
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(100).fill(0),
    ]);
    await expect(
      handleAuslageUpload({
        bytes: png,
        claimedMime: "application/pdf",
        originalFilename: "fake.pdf",
        submitterEmail: "x@y.de",
        storage: inner,
      }),
    ).rejects.toThrow(/MIME/);
  });

  it("rejects file > 4.5MB", async () => {
    const inner = new InMemoryMockFileStorage();
    const big = new Uint8Array(5 * 1024 * 1024);
    big.set(PDF_HEAD, 0);
    await expect(
      handleAuslageUpload({
        bytes: big,
        claimedMime: "application/pdf",
        originalFilename: "big.pdf",
        submitterEmail: "x@y.de",
        storage: inner,
      }),
    ).rejects.toThrow(/4\.5MB|too large/i);
  });

  it("thumbnail generation failure does NOT block upload (JPEG with sharp mocked to throw)", async () => {
    // Mock makeImageThumbnail to throw, exercising the catch path in upload-pipeline.
    const thumbnailModule = await import("$lib/server/files/thumbnail.js");
    const spy = vi
      .spyOn(thumbnailModule, "makeImageThumbnail")
      .mockRejectedValueOnce(new Error("sharp crashed"));

    const inner = new InMemoryMockFileStorage();
    // Minimal JPEG (SOI marker + JFIF header)
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00,
      0x01,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
      ...new Array(100).fill(0),
    ]);
    const r = await handleAuslageUpload({
      bytes: jpeg,
      claimedMime: "image/jpeg",
      originalFilename: "x.jpg",
      submitterEmail: "a@b.de",
      storage: inner,
    });
    expect(r.fileId).toBeTruthy();
    const rows = (await getDb().execute(
      sql`SELECT thumbnail_storage_key FROM files WHERE id = ${r.fileId}`,
    )) as unknown as Array<{ thumbnail_storage_key: string | null }>;
    expect(rows[0]?.thumbnail_storage_key).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("HEIC skips thumbnail generation (no thumbnail key)", async () => {
    const inner = new InMemoryMockFileStorage();
    // ftyp box: 4 bytes size + "ftyp" + "heic" major brand + 4 zero bytes + "heic" compat + padding
    const heic = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      0x66,
      0x74,
      0x79,
      0x70,
      0x68,
      0x65,
      0x69,
      0x63,
      0x00,
      0x00,
      0x00,
      0x00,
      0x68,
      0x65,
      0x69,
      0x63,
      ...new Array(200).fill(0),
    ]);
    const r = await handleAuslageUpload({
      bytes: heic,
      claimedMime: "image/heic",
      originalFilename: "x.heic",
      submitterEmail: "a@b.de",
      storage: inner,
    });
    expect(r.fileId).toBeTruthy();
    const rows = (await getDb().execute(
      sql`SELECT thumbnail_storage_key FROM files WHERE id = ${r.fileId}`,
    )) as unknown as Array<{ thumbnail_storage_key: string | null }>;
    expect(rows[0]?.thumbnail_storage_key).toBeNull();
  });
});
