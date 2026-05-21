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
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ChaosFileStorage } from "$lib/server/files/chaos-impl.js";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { runUploadPipeline } from "$lib/server/files/upload-pipeline.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

async function rowCount(query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await getDb().execute(query)) as unknown as Array<{
    c: number;
  }>;
  return rows[0]?.c ?? 0;
}

describe("upload pipeline", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    // Reset festgeschrieben_bis to JSONB null FIRST (via superuser, bypasses
    // both triggers) so the DELETE FROM files below isn't blocked by leftover
    // state from a prior test file (singleFork = state leaks across files).
    await resetFestgeschreibungBis();
    // FK-safe cleanup via superuser — bypasses the festgeschrieben_bis trigger
    // so a leftover lock from a prior describe-block can't block DELETE.
    await cleanupFilesViaAdmin();
    // auslagen_submissions has no FK INTO files (already nulled above) but the
    // test itself creates submission rows we want to wipe.
    await getDb().execute(sql`DELETE FROM auslagen_submissions`);
  });

  it("blob upload failure → no files row", async () => {
    const inner = new InMemoryMockFileStorage();
    const chaos = new ChaosFileStorage(inner);
    chaos.failNextUpload(1);
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    await expect(
      runUploadPipeline({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "t.pdf",
        submitterEmail: "a@b.de",
        actorUserId: null,
        sourceKind: "form",
        storage: chaos,
      }),
    ).rejects.toThrow(/CHAOS/);
    expect(await rowCount(sql`SELECT count(*)::int AS c FROM files`)).toBe(0);
  });

  it("sequential identical → same fileId, dedupHit on 2nd", async () => {
    const inner = new InMemoryMockFileStorage();
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    const r1 = await runUploadPipeline({
      bytes,
      claimedMime: "application/pdf",
      originalFilename: "t1.pdf",
      submitterEmail: "a@b.de",
      actorUserId: null,
      sourceKind: "form",
      storage: inner,
    });
    const r2 = await runUploadPipeline({
      bytes,
      claimedMime: "application/pdf",
      originalFilename: "t2.pdf",
      submitterEmail: "a@b.de",
      actorUserId: null,
      sourceKind: "form",
      storage: inner,
    });
    expect(r1.dedupHit).toBe(false);
    expect(r2.dedupHit).toBe(true);
    expect(r2.fileId).toBe(r1.fileId);

    // Audit-log: file_uploaded event written exactly once (first upload).
    // Phase 9 expert-audit gap closure: ADR-0012 §audit-log says the audit
    // log is the source of truth for what was uploaded — must verify the
    // row exists with the right entity_kind + payload.event + sha256.
    const audit = (await getDb().execute(sql`
      SELECT action, entity_kind, payload
      FROM audit_log
      WHERE entity_id = ${r1.fileId}
      AND payload->>'event' = 'file_uploaded'
    `)) as unknown as Array<{
      action: string;
      entity_kind: string;
      payload: { event: string; sha256: string };
    }>;
    expect(audit).toHaveLength(1);
    const auditRow = audit[0]!;
    expect(auditRow.action).toBe("create");
    expect(auditRow.entity_kind).toBe("file");
    expect(auditRow.payload.event).toBe("file_uploaded");
    expect(auditRow.payload.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("PARALLEL identical → exactly 1 files row", async () => {
    const inner = new InMemoryMockFileStorage();
    const bytes = new Uint8Array([...PDF_HEAD, ...new Array(100).fill(0)]);
    const [r1, r2] = await Promise.all([
      runUploadPipeline({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "a.pdf",
        submitterEmail: "x@y.de",
        actorUserId: null,
        sourceKind: "form",
        storage: inner,
      }),
      runUploadPipeline({
        bytes,
        claimedMime: "application/pdf",
        originalFilename: "b.pdf",
        submitterEmail: "x@y.de",
        actorUserId: null,
        sourceKind: "form",
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
      runUploadPipeline({
        bytes: png,
        claimedMime: "application/pdf",
        originalFilename: "fake.pdf",
        submitterEmail: "x@y.de",
        actorUserId: null,
        sourceKind: "form",
        storage: inner,
      }),
    ).rejects.toThrow(/MIME/);
  });

  it("rejects file > 4.5MB", async () => {
    const inner = new InMemoryMockFileStorage();
    const big = new Uint8Array(5 * 1024 * 1024);
    big.set(PDF_HEAD, 0);
    await expect(
      runUploadPipeline({
        bytes: big,
        claimedMime: "application/pdf",
        originalFilename: "big.pdf",
        submitterEmail: "x@y.de",
        actorUserId: null,
        sourceKind: "form",
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
    const r = await runUploadPipeline({
      bytes: jpeg,
      claimedMime: "image/jpeg",
      originalFilename: "x.jpg",
      submitterEmail: "a@b.de",
      actorUserId: null,
      sourceKind: "form",
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
    const r = await runUploadPipeline({
      bytes: heic,
      claimedMime: "image/heic",
      originalFilename: "x.heic",
      submitterEmail: "a@b.de",
      actorUserId: null,
      sourceKind: "form",
      storage: inner,
    });
    expect(r.fileId).toBeTruthy();
    const rows = (await getDb().execute(
      sql`SELECT thumbnail_storage_key FROM files WHERE id = ${r.fileId}`,
    )) as unknown as Array<{ thumbnail_storage_key: string | null }>;
    expect(rows[0]?.thumbnail_storage_key).toBeNull();
  });
});
