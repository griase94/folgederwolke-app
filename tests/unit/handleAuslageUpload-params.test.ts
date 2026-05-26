/**
 * C2-TAX — Phase-9 helper generalization.
 *
 * Pre-C2-TAX: `handleAuslageUpload({ bytes, claimedMime, originalFilename,
 * submitterEmail, storage })` in `upload-pipeline.ts` was form-only —
 * sourceKind was hard-coded to 'form' inside the function, and the only
 * identity column populated was `uploaded_by_submitter_email`.
 *
 * Post-C2-TAX: a new `handleAuslageUpload(file, params)` thin wrapper exposes
 *   - `submitterEmail` (form-mode) OR `actorUserId` (app-mode) — exactly one
 *   - `sourceKind: 'form' | 'app'` — propagated to files.source_kind per ADR-0010
 *
 * Test seam: the wrapper composes the existing upload-pipeline. We test the
 * wrapper's behavior end-to-end against the test DB (slot 7 in this worktree).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";
import { getDb } from "$lib/server/db/index.js";
import { sql } from "drizzle-orm";

// Smallest valid PDF: %PDF-1.4 header + EOF marker. 'file-type' will sniff
// the magic bytes and our prefix validator accepts this as application/pdf.
function mkPdfFile(): File {
  // Minimal valid PDF — 'file-type' library sniffs %PDF- at offset 0
  const minimalPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF\n",
    "utf-8",
  );
  return new File([minimalPdf], "test.pdf", { type: "application/pdf" });
}

describe("handleAuslageUpload(file, params) generalization", () => {
  beforeEach(async () => {
    // Clean previous test rows by sha256 (kept tight to avoid clobbering
    // fixtures: we only delete files whose filename is one of the magic
    // strings used in this test).
    await getDb().execute(
      sql`DELETE FROM files WHERE original_filename = 'test.pdf'`,
    );
  });

  it("writes source_kind='form' for sourceKind:'form' + submitterEmail", async () => {
    const res = await handleAuslageUpload(mkPdfFile(), {
      submitterEmail: "submitter@example.test",
      sourceKind: "form",
    });
    expect(res.fileId).toBeTruthy();
    const rows = await getDb().execute<{
      source_kind: string;
      uploaded_by_submitter_email: string | null;
      uploaded_by_user_id: string | null;
    }>(sql`
      SELECT source_kind, uploaded_by_submitter_email, uploaded_by_user_id
      FROM files WHERE id = ${res.fileId}
    `);
    const row = (
      rows as unknown as Array<{
        source_kind: string;
        uploaded_by_submitter_email: string | null;
        uploaded_by_user_id: string | null;
      }>
    )[0]!;
    expect(row.source_kind).toBe("form");
    expect(row.uploaded_by_submitter_email).toBe("submitter@example.test");
    expect(row.uploaded_by_user_id).toBeNull();
  });

  it("writes source_kind='app' for sourceKind:'app' + actorUserId", async () => {
    // The actor must reference an existing user. We use the seeded admin user
    // for the test — looked up by email so the test stays decoupled from id.
    const userLookup = (await getDb().execute<{ id: string }>(sql`
      SELECT id FROM users ORDER BY created_at ASC LIMIT 1
    `)) as unknown as Array<{ id: string }>;
    if (userLookup.length === 0) {
      // Seed doesn't always populate users (depends on fixture); skip cleanly.
      return;
    }
    const userId = userLookup[0]!.id;

    const res = await handleAuslageUpload(mkPdfFile(), {
      actorUserId: userId,
      sourceKind: "app",
    });
    const rows = (await getDb().execute<{
      source_kind: string;
      uploaded_by_submitter_email: string | null;
      uploaded_by_user_id: string | null;
    }>(sql`
      SELECT source_kind, uploaded_by_submitter_email, uploaded_by_user_id
      FROM files WHERE id = ${res.fileId}
    `)) as unknown as Array<{
      source_kind: string;
      uploaded_by_submitter_email: string | null;
      uploaded_by_user_id: string | null;
    }>;
    const row = rows[0]!;
    expect(row.source_kind).toBe("app");
    expect(row.uploaded_by_user_id).toBe(userId);
  });

  it("rejects when neither submitterEmail nor actorUserId provided", async () => {
    await expect(
      handleAuslageUpload(
        mkPdfFile(),
        // Intentionally violating the type contract to verify the runtime
        // identity assertion fires (defence-in-depth above the Zod schema).
        {
          sourceKind: "form",
        } as unknown as Parameters<typeof handleAuslageUpload>[1],
      ),
    ).rejects.toThrow(/submitterEmail|actorUserId/i);
  });
});
